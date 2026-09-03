import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Role } from '@mybuild/shared';

import type { RequestWithUser } from '../../modules/auth/auth-user.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

/**
 * Проверка роли из claim'а `user_role` (ТЗ §6).
 *
 * В базу не ходит: роль уже в подписанном токене. Работает в паре
 * с `SupabaseAuthGuard` и регистрируется строго после него.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<RequestWithUser>();

    if (!user) {
      throw new UnauthorizedException('Требуется авторизация');
    }

    if (!user.role) {
      // Хук не включён в проекте Supabase — иначе роль была бы в токене.
      // Сообщение прямое: без него это выглядит как случайный 403.
      throw new ForbiddenException(
        'В токене нет роли. Включите Custom Access Token Hook в проекте Supabase',
      );
    }

    if (!required.includes(user.role)) {
      throw new ForbiddenException('Недостаточно прав для этого действия');
    }

    return true;
  }
}
