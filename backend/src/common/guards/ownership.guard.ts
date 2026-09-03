import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Role, type OfferStatus, type OrderStatus } from '@mybuild/shared';

import type { RequestWithUser } from '../../modules/auth/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  ORDER_ACCESS_KEY,
  OrderAccessMode,
} from '../decorators/order-access.decorator.js';
import { isUuid } from '../uuid.js';

/**
 * Проверка владения заказом (ТЗ §6, «Ownership-guards»).
 *
 * Guard'у нужна база, потому что связь с заказом в токене не записана. Взамен
 * он кладёт найденное в запрос, и сервис читает уже готовое, а не ищет заново.
 *
 * Чужой заказ отдаётся как «не найден», а не «нет прав»: 403 подтвердил бы,
 * что заказ с таким идентификатором существует.
 */

/** Заказ, найденный guard'ом, вместе с ролью смотрящего в этом заказе. */
export interface OrderAccessContext {
  orderId: string;
  clientId: string;
  status: OrderStatus;
  /** Текущий пользователь — клиент этого заказа. */
  isOwner: boolean;
  /** Предложение текущей компании по заказу, если оно есть. */
  ownOffer: { id: string; status: OfferStatus } | null;
}

export interface RequestWithOrderAccess extends RequestWithUser {
  orderAccess?: OrderAccessContext;
}

@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Без явного режима считаем маршрут закрытым: забытый декоратор не должен
    // превращаться в открытый доступ к чужому заказу.
    const mode =
      this.reflector.getAllAndOverride<OrderAccessMode | undefined>(ORDER_ACCESS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? OrderAccessMode.OWNER;

    const request = context.switchToHttp().getRequest<RequestWithOrderAccess>();

    if (!request.user) {
      throw new UnauthorizedException('Требуется авторизация');
    }

    // Express 5 описывает параметр как `string | string[]`: повторить `:id`
    // в нашем маршруте нельзя, но типы этого не знают.
    const raw: unknown = request.params?.['id'];
    const orderId = typeof raw === 'string' ? raw : '';

    // `:id` в маршрутах заказа — UUID. Проверяем до запроса: иначе Prisma даст 500.
    if (!isUuid(orderId)) {
      throw new NotFoundException('Заказ не найден');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        clientId: true,
        status: true,
        offers: {
          where: { companyId: request.user.id },
          select: { id: true, status: true },
          take: 1,
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Заказ не найден');
    }

    const isOwner = order.clientId === request.user.id;
    const ownOffer = order.offers[0] ?? null;

    // Компания заказ увидеть может — но не его прогресс, если не участвует
    // (ТЗ §4.1). Урезает ответ `order-view`, а не guard: здесь решается
    // только «пускать или нет». Условие написано «пускаем компанию», а не
    // «не пускаем клиента»: без роли в токене (хук выключён) доступа не будет.
    const allowed =
      isOwner || (mode === OrderAccessMode.VIEWER && request.user.role === Role.COMPANY);

    if (!allowed) {
      throw new NotFoundException('Заказ не найден');
    }

    request.orderAccess = {
      orderId,
      clientId: order.clientId,
      status: order.status,
      isOwner,
      ownOffer,
    };

    return true;
  }
}
