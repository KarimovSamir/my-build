import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { Role } from '@mybuild/shared';

import type { AuthUser } from '../../modules/auth/auth-user.js';
import { Roles } from '../decorators/roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

/** Маршруты с настоящими декораторами: заодно проверяется и `@Roles`. */
class TestRoutes {
  open(): void {}

  @Roles(Role.CLIENT)
  clientOnly(): void {}

  @Roles(Role.CLIENT, Role.COMPANY)
  bothRoles(): void {}
}

type RouteName = keyof TestRoutes;

function contextFor(
  route: RouteName,
  user: AuthUser | undefined,
  type: 'http' | 'ws' = 'http',
): ExecutionContext {
  return {
    getType: () => type,
    getHandler: () => TestRoutes.prototype[route],
    getClass: () => TestRoutes,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const guard = new RolesGuard(new Reflector());

const verified = { emailVerified: true } as const;

const client: AuthUser = { id: 'u1', email: 'a@b.test', role: Role.CLIENT, ...verified };
const company: AuthUser = { id: 'u2', email: 'c@d.test', role: Role.COMPANY, ...verified };
const roleless: AuthUser = { id: 'u3', email: 'e@f.test', role: null, ...verified };

describe('RolesGuard', () => {
  it('пропускает маршрут без ограничения по роли', () => {
    expect(guard.canActivate(contextFor('open', client))).toBe(true);
  });

  it('пропускает пользователя с нужной ролью', () => {
    expect(guard.canActivate(contextFor('clientOnly', client))).toBe(true);
  });

  it('пропускает, если маршрут разрешён нескольким ролям', () => {
    expect(guard.canActivate(contextFor('bothRoles', company))).toBe(true);
  });

  it('отказывает чужой роли', () => {
    expect(() => guard.canActivate(contextFor('clientOnly', company))).toThrow(
      ForbiddenException,
    );
  });

  it('отказывает и объясняет причину, если роли в токене нет', () => {
    expect(() => guard.canActivate(contextFor('clientOnly', roleless))).toThrow(
      /Custom Access Token Hook/,
    );
  });

  it('требует авторизации, если пользователя в запросе нет вовсе', () => {
    expect(() => guard.canActivate(contextFor('clientOnly', undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it('маршрут без ограничения по роли пропускает и в контексте сокета', () => {
    // Guard глобальный: до обработчиков сообщений шлюза он тоже доходит.
    expect(guard.canActivate(contextFor('open', client, 'ws'))).toBe(true);
  });

  it('в контексте сокета роль не проверяет, а отказывает', () => {
    // `switchToHttp().getRequest()` вернул бы там сокет, и роль читалась бы
    // из пустоты. Роль на сокете проверяет сам шлюз — молчаливого «пропустить»
    // тут быть не должно.
    expect(() => guard.canActivate(contextFor('clientOnly', client, 'ws'))).toThrow(
      ForbiddenException,
    );
  });
});
