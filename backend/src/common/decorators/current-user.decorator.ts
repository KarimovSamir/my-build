import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';

import type { AuthUser, RequestWithUser } from '../../modules/auth/auth-user.js';

/**
 * Пользователь из проверенного токена.
 *
 * Если декоратор оказался на публичном маршруте, пользователя в запросе нет —
 * это ошибка разработчика, а не клиента, поэтому 500, а не 401. Молча отдавать
 * `undefined` нельзя: дальше по коду это выглядело бы как «анонимный доступ».
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    if (!request.user) {
      throw new InternalServerErrorException(
        'Маршрут запрашивает пользователя, но не защищён SupabaseAuthGuard',
      );
    }

    return request.user;
  },
);
