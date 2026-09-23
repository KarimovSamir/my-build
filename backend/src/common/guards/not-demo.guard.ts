import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { RequestWithUser } from '../../modules/auth/auth-user.js';

/**
 * Закрывает маршрут для общих демо-учёток (`AuthUser.isDemo`).
 *
 * Демо-аккаунтом с экрана входа пользуются все посетители сразу, поэтому
 * правка, которую видят остальные и которую нечем откатить, кроме сброса
 * демо, — это порча витрины, а не пробное действие. Сама работа с заказами
 * демо открыта: ради неё аккаунты и показаны.
 *
 * Ставится после `SupabaseAuthGuard` (он глобальный и идёт первым), то есть
 * пользователь в запросе уже есть.
 */
@Injectable()
export class NotDemoGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    if (request.user?.isDemo) {
      throw new ForbiddenException(
        'Демо-аккаунт общий для всех посетителей, поэтому это в нём не меняется. ' +
          'Зарегистрируйтесь, чтобы попробовать со своим аккаунтом',
      );
    }

    return true;
  }
}
