import { ExecutionContext, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { OfferStatus, OrderStatus, Role } from '@mybuild/shared';

import type { AuthUser, RequestWithUser } from '../../modules/auth/auth-user.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { OrderAccess, OrderAccessMode } from '../decorators/order-access.decorator.js';
import { OwnershipGuard, type RequestWithOrderAccess } from './ownership.guard.js';

/**
 * Правило допуска к заказу целиком, без сети (находка Т-С2).
 *
 * Раньше оно проверялось только через e2e с живой базой, то есть самая
 * чувствительная часть модели доступа зависела от связи и от Supabase.
 * Здесь база подставная, а декораторы — настоящие: режим маршрута читается
 * тем же `Reflector`, что и в приложении.
 */

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';

/** Маршруты с настоящими декораторами: заодно проверяется режим по умолчанию. */
class TestRoutes {
  @OrderAccess(OrderAccessMode.VIEWER)
  viewer(): void {}

  @OrderAccess(OrderAccessMode.OWNER)
  owner(): void {}

  @OrderAccess(OrderAccessMode.EXECUTOR)
  executor(): void {}

  /** Декоратора нет: guard обязан считать маршрут закрытым. */
  undecorated(): void {}
}

type RouteName = keyof TestRoutes;

/** Заказ в подставной базе — ровно те поля, которые выбирает guard. */
interface StubOrder {
  clientId: string;
  status: OrderStatus;
  offers: { id: string; status: OfferStatus; companyId: string }[];
}

/** Форма запроса, которую строит guard: предложения сужены до смотрящего. */
interface OrderFindUniqueArgs {
  where: { id: string };
  select: { offers: { where: { companyId: string } } };
}

/**
 * Подставная база. Фильтрует предложения по-настоящему: иначе тест не отличил
 * бы «своё предложение компании» от любого предложения этого заказа.
 */
function createPrismaStub(order: StubOrder | null) {
  return {
    order: {
      findUnique: vi.fn(async (args: OrderFindUniqueArgs) => {
        if (!order) return null;

        return {
          clientId: order.clientId,
          status: order.status,
          offers: order.offers
            .filter((offer) => offer.companyId === args.select.offers.where.companyId)
            .slice(0, 1)
            .map((offer) => ({ id: offer.id, status: offer.status })),
        };
      }),
    },
  };
}

function contextFor(route: RouteName, request: Partial<RequestWithOrderAccess>) {
  return {
    request,
    context: {
      getHandler: () => TestRoutes.prototype[route],
      getClass: () => TestRoutes,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
}

function requestFor(user: AuthUser | undefined, id: unknown = ORDER_ID) {
  return {
    user,
    params: { id },
  } as unknown as Partial<RequestWithUser>;
}

const client: AuthUser = {
  id: CLIENT_ID,
  email: 'client@e2e.test',
  emailVerified: true,
  role: Role.CLIENT,
};

const company: AuthUser = {
  id: COMPANY_ID,
  email: 'company@e2e.test',
  emailVerified: true,
  role: Role.COMPANY,
};

const waitingOrder: StubOrder = {
  clientId: CLIENT_ID,
  status: OrderStatus.WAITING,
  offers: [],
};

function guardWith(prisma: ReturnType<typeof createPrismaStub>): OwnershipGuard {
  return new OwnershipGuard(new Reflector(), prisma as unknown as PrismaService);
}

describe('OwnershipGuard', () => {
  it('без пользователя в запросе отдаёт 401', async () => {
    const prisma = createPrismaStub(waitingOrder);
    const { context } = contextFor('viewer', requestFor(undefined));

    await expect(guardWith(prisma).canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });

  it.each(['not-a-uuid', '', '123', `${ORDER_ID} or 1=1`])(
    'на идентификатор не в форме UUID отдаёт 404 и в базу не ходит: %s',
    async (id) => {
      const prisma = createPrismaStub(waitingOrder);
      const { context } = contextFor('viewer', requestFor(client, id));

      await expect(guardWith(prisma).canActivate(context)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.order.findUnique).not.toHaveBeenCalled();
    },
  );

  it('на отсутствующий параметр отдаёт 404', async () => {
    const prisma = createPrismaStub(waitingOrder);
    // Параметра `:id` нет вовсе — маршрут подключили не к тому пути.
    const { context } = contextFor('viewer', { user: client, params: {} } as unknown as
      Partial<RequestWithOrderAccess>);

    await expect(guardWith(prisma).canActivate(context)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('на несуществующий заказ отдаёт 404', async () => {
    const { context } = contextFor('owner', requestFor(client));

    await expect(guardWith(createPrismaStub(null)).canActivate(context)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('пускает владельца и кладёт заказ в запрос', async () => {
    const prisma = createPrismaStub(waitingOrder);
    const { context, request } = contextFor('owner', requestFor(client));

    await expect(guardWith(prisma).canActivate(context)).resolves.toBe(true);
    expect(request.orderAccess).toEqual({
      orderId: ORDER_ID,
      clientId: CLIENT_ID,
      status: OrderStatus.WAITING,
      isOwner: true,
      ownOffer: null,
    });
  });

  it('спрашивает у базы только предложения самого смотрящего', async () => {
    const prisma = createPrismaStub(waitingOrder);
    const { context } = contextFor('viewer', requestFor(company));

    await guardWith(prisma).canActivate(context);

    expect(prisma.order.findUnique.mock.calls[0]![0]).toMatchObject({
      where: { id: ORDER_ID },
      select: { offers: { where: { companyId: COMPANY_ID }, take: 1 } },
    });
  });

  it('не пускает компанию на маршрут владельца — 404, а не 403', async () => {
    // 403 подтвердил бы, что заказ с таким идентификатором существует.
    const { context } = contextFor('owner', requestFor(company));

    await expect(
      guardWith(createPrismaStub(waitingOrder)).canActivate(context),
    ).rejects.toThrow(NotFoundException);
  });

  it('без декоратора маршрут считается закрытым: компанию не пускает', async () => {
    const { context } = contextFor('undecorated', requestFor(company));

    await expect(
      guardWith(createPrismaStub(waitingOrder)).canActivate(context),
    ).rejects.toThrow(NotFoundException);
  });

  it('без декоратора владельца пускает', async () => {
    const { context } = contextFor('undecorated', requestFor(client));

    await expect(
      guardWith(createPrismaStub(waitingOrder)).canActivate(context),
    ).resolves.toBe(true);
  });

  it('пускает компанию на маршрут просмотра и отдаёт её предложение', async () => {
    const prisma = createPrismaStub({
      clientId: CLIENT_ID,
      status: OrderStatus.AWAITING_CONFIRMATION,
      offers: [{ id: 'offer-own', status: OfferStatus.SENT, companyId: COMPANY_ID }],
    });
    const { context, request } = contextFor('viewer', requestFor(company));

    await expect(guardWith(prisma).canActivate(context)).resolves.toBe(true);
    expect(request.orderAccess).toEqual({
      orderId: ORDER_ID,
      clientId: CLIENT_ID,
      status: OrderStatus.AWAITING_CONFIRMATION,
      isOwner: false,
      ownOffer: { id: 'offer-own', status: OfferStatus.SENT },
    });
  });

  it('компания без своего предложения проходит, но с пустым `ownOffer`', async () => {
    const prisma = createPrismaStub({
      clientId: CLIENT_ID,
      status: OrderStatus.AWAITING_CONFIRMATION,
      // Предложение есть, но чужое: guard не должен выдать его за своё.
      offers: [{ id: 'offer-rival', status: OfferStatus.SENT, companyId: 'other' }],
    });
    const { context, request } = contextFor('viewer', requestFor(company));

    await expect(guardWith(prisma).canActivate(context)).resolves.toBe(true);
    expect(request.orderAccess?.ownOffer).toBeNull();
  });

  it('не пускает на чужой заказ другого клиента даже в режиме просмотра', async () => {
    const stranger: AuthUser = { ...client, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
    const { context } = contextFor('viewer', requestFor(stranger));

    await expect(
      guardWith(createPrismaStub(waitingOrder)).canActivate(context),
    ).rejects.toThrow(NotFoundException);
  });

  describe('режим исполнителя', () => {
    function orderWithOwnOffer(status: OfferStatus): StubOrder {
      return {
        clientId: CLIENT_ID,
        status: OrderStatus.IN_PROGRESS,
        offers: [{ id: 'offer-own', status, companyId: COMPANY_ID }],
      };
    }

    it.each([
      OfferStatus.ACCEPTED,
      OfferStatus.WORK_SUBMITTED,
      OfferStatus.BACK_FOR_OVERRIDE,
      // Завершённый заказ компания тоже должна открывать: маршрут ответит 409,
      // но это решение state-машины, а не отказ в доступе.
      OfferStatus.COMPLETED,
    ])('пускает компанию с предложением в статусе %s', async (status) => {
      const prisma = createPrismaStub(orderWithOwnOffer(status));
      const { context, request } = contextFor('executor', requestFor(company));

      await expect(guardWith(prisma).canActivate(context)).resolves.toBe(true);
      expect(request.orderAccess?.ownOffer).toEqual({ id: 'offer-own', status });
    });

    it.each([
      OfferStatus.SENT,
      OfferStatus.REJECTED,
      OfferStatus.WITHDRAWN,
      OfferStatus.NOT_ACCEPTED,
    ])('не пускает компанию с предложением в статусе %s', async (status) => {
      const { context } = contextFor('executor', requestFor(company));

      await expect(
        guardWith(createPrismaStub(orderWithOwnOffer(status))).canActivate(context),
      ).rejects.toThrow(NotFoundException);
    });

    it('не пускает владельца заказа: сдаёт работу не он', async () => {
      const prisma = createPrismaStub(orderWithOwnOffer(OfferStatus.ACCEPTED));
      const { context } = contextFor('executor', requestFor(client));

      await expect(guardWith(prisma).canActivate(context)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('не пускает компанию без предложения по заказу', async () => {
      const { context } = contextFor('executor', requestFor(company));

      await expect(
        guardWith(createPrismaStub(waitingOrder)).canActivate(context),
      ).rejects.toThrow(NotFoundException);
    });
  });

  it('не пускает пользователя без роли в токене', async () => {
    // Хук Custom Access Token отключён: роли нет, и режим просмотра
    // не должен превращаться в «пускаем кого угодно».
    const roleless: AuthUser = { ...company, role: null };
    const { context } = contextFor('viewer', requestFor(roleless));

    await expect(
      guardWith(createPrismaStub(waitingOrder)).canActivate(context),
    ).rejects.toThrow(NotFoundException);
  });
});
