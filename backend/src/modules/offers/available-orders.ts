/**
 * Какие заказы компания видит в ленте «Доступные для предложений» (ТЗ §4.1).
 *
 * Условие вынесено из сервиса отдельным модулем без Nest и без базы: это
 * правило приватности, а не деталь запроса, и проверяться оно должно
 * unit-тестами целиком, а не только прогоном по живым данным.
 */

import {
  MAX_OFFER_REJECTIONS,
  OFFER_ELIGIBLE_ORDER_STATUSES,
  OfferStatus,
} from '@mybuild/shared';

import { sameWorldUser } from '../../common/demo-world.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { buildSearchConditions } from '../orders/order-search.js';

/** Списки в `shared/` объявлены `readonly`, а Prisma ждёт изменяемый массив. */
const ELIGIBLE_ORDER_STATUSES = [...OFFER_ELIGIBLE_ORDER_STATUSES];

/**
 * Заказ попадает в ленту, если он ещё ищет исполнителя и у этой компании
 * по нему **нет** предложения либо оно отозвано или отклонено (отклонённое —
 * пока клиент не отказал окончательно).
 *
 * Второе условие обязательно: строка `Offer` остаётся в базе из-за
 * уникального ограничения, и без него компания, отозвавшая предложение,
 * потеряла бы заказ навсегда (ТЗ §4.1).
 *
 * Поиск ищет по номеру и названию заказа, но не по подрядчику: у заказа
 * в ленте исполнителя нет по определению.
 *
 * И только заказы клиентов своего мира: демо-компания видит заказы
 * демо-клиента, настоящая — настоящих (`common/demo-world.ts`).
 */
export function buildAvailableOrdersWhere(
  company: { id: string; isDemo: boolean },
  query?: string,
): Prisma.OrderWhereInput {
  const companyId = company.id;

  // Отклонённое — только пока отказ не окончательный: то же правило, что
  // `canResubmitOffer` в `shared/` (после `MAX_OFFER_REJECTIONS` отказов
  // заказ из ленты компании уходит насовсем, решение пользователя).
  const availability: Prisma.OrderWhereInput = {
    OR: [
      { offers: { none: { companyId } } },
      { offers: { some: { companyId, status: OfferStatus.WITHDRAWN } } },
      {
        offers: {
          some: {
            companyId,
            status: OfferStatus.REJECTED,
            rejectionCount: { lt: MAX_OFFER_REJECTIONS },
          },
        },
      },
    ],
  };

  // Условия складываются через `AND`, а не соседними ключами: и доступность,
  // и поиск — это `OR`, и один просто затёр бы другой.
  return {
    status: { in: ELIGIBLE_ORDER_STATUSES },
    client: sameWorldUser(company.isDemo),
    AND: query
      ? [availability, { OR: buildSearchConditions(query, { includeContractor: false }) }]
      : [availability],
  };
}
