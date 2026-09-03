import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { RequestWithUser } from '../../modules/auth/auth-user.js';
import {
  InvalidTokenError,
  SupabaseJwtService,
} from '../../modules/auth/supabase-jwt.service.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

/**
 * Пропускает запрос только с действительным access-токеном Supabase (ТЗ §6).
 *
 * Регистрируется глобально, поэтому закрыто всё, кроме помеченного `@Public()`.
 *
 * Неподтверждённый email — тоже отказ: ТЗ §6 требует, чтобы до подтверждения
 * пользователь не мог пользоваться кабинетом. Настройка в панели Supabase
 * обычно не даёт такому пользователю даже получить сессию, но полагаться
 * на один переключатель в чужой панели нельзя.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: SupabaseJwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Требуется авторизация');
    }

    try {
      request.user = await this.jwt.verify(token);
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }

    if (!request.user.emailVerified) {
      throw new ForbiddenException('Подтвердите email: ссылка отправлена на вашу почту');
    }

    return true;
  }
}

/** `Authorization: Bearer <token>` → сам токен. Схема сверяется без учёта регистра. */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;

  const [scheme, value, ...rest] = header.split(' ');

  if (rest.length > 0 || scheme?.toLowerCase() !== 'bearer' || !value) {
    return null;
  }

  return value;
}
