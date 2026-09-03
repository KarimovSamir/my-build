import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { Role } from '@mybuild/shared';

import type { RequestWithUser } from '../../modules/auth/auth-user.js';
import {
  InvalidTokenError,
  SupabaseJwtService,
} from '../../modules/auth/supabase-jwt.service.js';
import { Public } from '../decorators/public.decorator.js';
import { extractBearerToken, SupabaseAuthGuard } from './supabase-auth.guard.js';

/** Маршруты с настоящими декораторами: заодно проверяется и `@Public`. */
class TestRoutes {
  @Public()
  open(): void {}

  protected_(): void {}
}

type RouteName = keyof TestRoutes;

function contextFor(route: RouteName, request: Partial<RequestWithUser>) {
  return {
    request,
    context: {
      getHandler: () => TestRoutes.prototype[route],
      getClass: () => TestRoutes,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
}

/** Подменяет проверку подписи: сама jose проверена своими тестами. */
function jwtServiceStub(verify: SupabaseJwtService['verify']): SupabaseJwtService {
  return { verify } as SupabaseJwtService;
}

function guardWith(verify: SupabaseJwtService['verify']): SupabaseAuthGuard {
  return new SupabaseAuthGuard(new Reflector(), jwtServiceStub(verify));
}

const failIfCalled = () => Promise.reject(new Error('проверка токена не должна вызываться'));

describe('extractBearerToken', () => {
  it('достаёт токен из корректного заголовка', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('не зависит от регистра схемы', () => {
    expect(extractBearerToken('bearer abc')).toBe('abc');
  });

  it.each([undefined, '', 'abc', 'Basic abc', 'Bearer', 'Bearer a b'])(
    'возвращает null для некорректного заголовка: %s',
    (header) => {
      expect(extractBearerToken(header)).toBeNull();
    },
  );
});

describe('SupabaseAuthGuard', () => {
  it('пропускает публичный маршрут без токена', async () => {
    const { context } = contextFor('open', { headers: {} });

    await expect(guardWith(failIfCalled).canActivate(context)).resolves.toBe(true);
  });

  it('отказывает без заголовка Authorization', async () => {
    const { context } = contextFor('protected_', { headers: {} });

    await expect(guardWith(failIfCalled).canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('кладёт пользователя в запрос после успешной проверки', async () => {
    const user = { id: 'u1', email: 'a@b.test', role: Role.CLIENT };
    const verify = vi.fn().mockResolvedValue(user);
    const { context, request } = contextFor('protected_', {
      headers: { authorization: 'Bearer token' },
    });

    await expect(guardWith(verify).canActivate(context)).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('token');
    expect(request.user).toEqual(user);
  });

  it('превращает ошибку проверки токена в 401', async () => {
    const { context } = contextFor('protected_', {
      headers: { authorization: 'Bearer bad' },
    });
    const guard = guardWith(() => Promise.reject(new InvalidTokenError('Токен истёк')));

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('не прячет посторонние ошибки под 401', async () => {
    const { context } = contextFor('protected_', {
      headers: { authorization: 'Bearer token' },
    });
    const guard = guardWith(() => Promise.reject(new Error('JWKS недоступен')));

    await expect(guard.canActivate(context)).rejects.toThrow(/JWKS недоступен/);
  });
});
