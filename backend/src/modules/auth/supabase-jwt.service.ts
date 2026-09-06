import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import { Role } from '@mybuild/shared';

import type { AuthUser } from './auth-user.js';

/** Ошибка проверки токена. В HTTP-слое превращается в 401. */
export class InvalidTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

/**
 * Проверенный токен: пользователь и момент, после которого токен недействителен.
 *
 * Срок нужен не всем: у REST токен проверяется на каждом запросе, и следить
 * за `exp` там незачем. У сокета иначе — рукопожатие одно, а соединение живёт
 * часами, поэтому шлюз обязан закрыть его сам, когда токен истёк (ТЗ §6).
 */
export interface VerifiedToken {
  user: AuthUser;
  /** `exp` в миллисекундах. `null` — в токене нет срока (у Supabase не бывает). */
  expiresAt: number | null;
}

/**
 * Проверка access-токена Supabase (ТЗ §6).
 *
 * Backend не спрашивает Supabase на каждый запрос: подпись проверяется локально
 * по JWKS проекта. `createRemoteJWKSet` сам держит ключи в памяти и ходит за
 * ними заново только при неизвестном `kid` — то есть после ротации ключа,
 * не чаще, чем раз в `cooldownDuration`.
 */
@Injectable()
export class SupabaseJwtService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseJwtService.name);

  private jwks!: ReturnType<typeof createRemoteJWKSet>;
  private issuer!: string;
  private audience!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const jwksUrl = this.config.getOrThrow<string>('SUPABASE_JWKS_URL');
    this.issuer = this.config.getOrThrow<string>('SUPABASE_JWT_ISSUER');
    this.audience = this.config.getOrThrow<string>('SUPABASE_JWT_AUDIENCE');

    this.jwks = createRemoteJWKSet(new URL(jwksUrl), {
      // Ключи живут в памяти 10 минут; при неизвестном kid повторный запрос
      // разрешён не чаще раза в 30 секунд — защита от шторма запросов
      // к Supabase, если кто-то присылает мусорные токены.
      cacheMaxAge: 10 * 60 * 1000,
      cooldownDuration: 30 * 1000,
    });
  }

  /**
   * Проверить токен и достать из него пользователя.
   * Любая проблема с подписью, издателем, аудиторией или сроком — исключение.
   */
  async verify(token: string): Promise<AuthUser> {
    return (await this.verifyToken(token)).user;
  }

  /** То же самое, но со сроком действия: нужен шлюзу WebSocket. */
  async verifyToken(token: string): Promise<VerifiedToken> {
    let payload: JWTPayload;

    try {
      ({ payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
      }));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Токен отклонён: ${reason}`);
      throw new InvalidTokenError('Токен недействителен или истёк');
    }

    if (!payload.sub) {
      throw new InvalidTokenError('В токене нет идентификатора пользователя');
    }

    return {
      user: {
        id: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : null,
        emailVerified: readEmailVerified(payload),
        role: this.readRole(payload),
      },
      expiresAt: typeof payload.exp === 'number' ? payload.exp * 1000 : null,
    };
  }

  /**
   * Роль приходит claim'ом `user_role` из Custom Access Token Hook.
   * Чужое или отсутствующее значение — это `null`, а не ошибка: пользователь
   * остаётся аутентифицированным, но до ролевых маршрутов его не пустят.
   */
  private readRole(payload: JWTPayload): Role | null {
    const claim = payload.user_role;

    if (claim === Role.CLIENT || claim === Role.COMPANY) {
      return claim;
    }

    if (claim !== undefined) {
      this.logger.warn(`Неизвестная роль в токене: ${String(claim)}`);
    }

    return null;
  }
}

/**
 * Подтверждён ли email (ТЗ §6: до подтверждения кабинет закрыт).
 *
 * Claim `email_verified` кладёт наш Custom Access Token Hook, читая
 * `auth.users.email_confirmed_at`. Брать одноимённое поле из `user_metadata`
 * нельзя: метаданные пользователь меняет сам через `updateUser`, то есть
 * проверка обходилась бы одним запросом.
 *
 * Claim'а нет — считаем подтверждённым: это значит, что хук в проекте выключен,
 * и тогда в токене нет и роли, а без роли `RolesGuard` не пустит никуда
 * и скажет об этом прямо. Обратный выбор превратил бы выключенный хук
 * в полностью неработающее приложение без внятной причины.
 */
function readEmailVerified(payload: JWTPayload): boolean {
  return payload.email_verified !== false;
}
