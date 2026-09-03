import type { ConfigService } from '@nestjs/config';
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWK,
  type JWTPayload,
} from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Role } from '@mybuild/shared';

import { InvalidTokenError, SupabaseJwtService } from './supabase-jwt.service.js';

/**
 * Проверка токена — самое чувствительное к безопасности место backend'а
 * (ТЗ §6): здесь решается, кто вошёл и с какой ролью.
 *
 * Тест работает с настоящей парой ключей ES256 (такие и выдаёт Supabase)
 * и настоящей библиотекой `jose`. Подменяется только сеть: `createRemoteJWKSet`
 * ходит за ключами обычным `fetch`, и вместо проекта Supabase он получает
 * наш публичный ключ.
 */

const ISSUER = 'https://example.supabase.co/auth/v1';
const JWKS_URL = 'https://example.supabase.co/auth/v1/.well-known/jwks.json';
const AUDIENCE = 'authenticated';
const KID = 'test-key';

let privateKey: CryptoKey;
let publicJwk: JWK;
/** Ключ, которого нет в JWKS: им подписываются заведомо чужие токены. */
let foreignKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair('ES256', { extractable: true });
  privateKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), alg: 'ES256', use: 'sig', kid: KID };

  foreignKey = (await generateKeyPair('ES256', { extractable: true })).privateKey;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const config = {
  getOrThrow: (key: string) =>
    ({
      SUPABASE_JWKS_URL: JWKS_URL,
      SUPABASE_JWT_ISSUER: ISSUER,
      SUPABASE_JWT_AUDIENCE: AUDIENCE,
    })[key],
} as unknown as ConfigService;

/** Сервис с подменённой сетью: JWKS отдаёт ровно наш публичный ключ. */
function createService(): { service: SupabaseJwtService; fetchMock: ReturnType<typeof vi.fn> } {
  // `jose` вешает `.catch` на результат, поэтому подмена обязана вернуть Promise.
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );

  vi.stubGlobal('fetch', fetchMock);

  const service = new SupabaseJwtService(config);
  service.onModuleInit();

  return { service, fetchMock };
}

interface TokenOptions {
  payload?: JWTPayload;
  issuer?: string;
  audience?: string;
  expiresIn?: string;
  key?: CryptoKey;
}

function sign({
  payload = {},
  issuer = ISSUER,
  audience = AUDIENCE,
  expiresIn = '1h',
  key,
}: TokenOptions = {}): Promise<string> {
  return new SignJWT({ sub: 'a0000000-0000-4000-8000-000000000001', ...payload })
    .setProtectedHeader({ alg: 'ES256', kid: KID })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key ?? privateKey);
}

describe('SupabaseJwtService', () => {
  it('принимает правильно подписанный токен и достаёт из него пользователя', async () => {
    const { service } = createService();
    const token = await sign({
      payload: { email: 'anna@example.test', user_role: Role.CLIENT, email_verified: true },
    });

    await expect(service.verify(token)).resolves.toEqual({
      id: 'a0000000-0000-4000-8000-000000000001',
      email: 'anna@example.test',
      emailVerified: true,
      role: Role.CLIENT,
    });
  });

  it('ходит за ключами один раз: они кэшируются в памяти', async () => {
    const { service, fetchMock } = createService();

    await service.verify(await sign());
    await service.verify(await sign());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('отклоняет токен, подписанный чужим ключом', async () => {
    const { service } = createService();

    await expect(service.verify(await sign({ key: foreignKey }))).rejects.toThrow(
      InvalidTokenError,
    );
  });

  it('отклоняет токен с изменённой полезной нагрузкой', async () => {
    const { service } = createService();
    const [header, , signature] = (await sign()).split('.');
    const forged = Buffer.from(
      JSON.stringify({ sub: 'a0000000-0000-4000-8000-000000000009', user_role: Role.COMPANY }),
    ).toString('base64url');

    await expect(service.verify(`${header}.${forged}.${signature}`)).rejects.toThrow(
      InvalidTokenError,
    );
  });

  it('отклоняет токен чужого проекта (другой iss)', async () => {
    const { service } = createService();

    await expect(
      service.verify(await sign({ issuer: 'https://another.supabase.co/auth/v1' })),
    ).rejects.toThrow(InvalidTokenError);
  });

  it('отклоняет токен с чужой аудиторией', async () => {
    const { service } = createService();

    await expect(service.verify(await sign({ audience: 'anon' }))).rejects.toThrow(
      InvalidTokenError,
    );
  });

  it('отклоняет истёкший токен', async () => {
    const { service } = createService();

    await expect(service.verify(await sign({ expiresIn: '-1s' }))).rejects.toThrow(
      InvalidTokenError,
    );
  });

  it('отклоняет мусор вместо токена', async () => {
    const { service } = createService();

    await expect(service.verify('не-токен')).rejects.toThrow(InvalidTokenError);
  });

  it('отклоняет токен без идентификатора пользователя', async () => {
    const { service } = createService();
    const token = await new SignJWT({ user_role: Role.CLIENT })
      .setProtectedHeader({ alg: 'ES256', kid: KID })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('1h')
      .sign(privateKey);

    await expect(service.verify(token)).rejects.toThrow(/идентификатора/);
  });

  it('не раскрывает наружу причину отказа', async () => {
    const { service } = createService();

    await expect(service.verify(await sign({ expiresIn: '-1s' }))).rejects.toThrow(
      'Токен недействителен или истёк',
    );
  });

  describe('роль из claim user_role', () => {
    it.each([Role.CLIENT, Role.COMPANY])('читает роль %s', async (role) => {
      const { service } = createService();
      const user = await service.verify(await sign({ payload: { user_role: role } }));

      expect(user.role).toBe(role);
    });

    it.each([undefined, 'ADMIN', '', 42, null])(
      'считает ролью null неизвестное значение: %s',
      async (claim) => {
        const { service } = createService();
        const user = await service.verify(await sign({ payload: { user_role: claim } }));

        expect(user.role).toBeNull();
      },
    );
  });

  describe('claim email_verified (ТЗ §6)', () => {
    it('видит неподтверждённый адрес', async () => {
      const { service } = createService();
      const user = await service.verify(await sign({ payload: { email_verified: false } }));

      expect(user.emailVerified).toBe(false);
    });

    it('без claim считает адрес подтверждённым: хук выключен, роли тоже нет', async () => {
      const { service } = createService();
      const user = await service.verify(await sign());

      expect(user.emailVerified).toBe(true);
      expect(user.role).toBeNull();
    });

    it('не верит одноимённому полю в user_metadata: его меняет сам пользователь', async () => {
      const { service } = createService();
      const user = await service.verify(
        await sign({ payload: { email_verified: false, user_metadata: { email_verified: true } } }),
      );

      expect(user.emailVerified).toBe(false);
    });
  });

  it('без email в токене оставляет поле пустым', async () => {
    const { service } = createService();
    const user = await service.verify(await sign({ payload: { email: 42 } }));

    expect(user.email).toBeNull();
  });
});
