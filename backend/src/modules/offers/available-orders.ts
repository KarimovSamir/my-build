/**
 * Какие заказы компания видит в ленте «Доступные для предложений» (ТЗ §4.1).
 *
 * Условие вынесено из сервиса отдельным модулем без Nest и без базы: это
 * правило приватности, а не деталь запроса, и проверяться оно должно
 * unit-тестами целиком, а не только прогоном по живым данным.
 */

import {
  OFFER_ELIGIBLE_ORDER_STATUSES,
  RESUBMITTABLE_OFFER_STATUSES,
} from '@mybuild/shared';

import type { Prisma } from '../../generated/prisma/client.js';
import { buildSearchConditions } from '../orders/order-search.js';

/** Списки в `shared/` объявлены `readonly`, а Prisma ждёт изменяемый массив. */
const ELIGIBLE_ORDER_STATUSES = [...OFFER_ELIGIBLE_ORDER_STATUSES];
const RESUBMITTABLE_STATUSES = [...RESUBMITTABLE_OFFER_STATUSES];

/**
 * Заказ попадает в ленту, если он ещё ищет исполнителя и у этой компании
 * по нему **нет** предложения либо оно отозвано или отклонено.
 *
 * Второе условие обязательно: строка `Offer` остаётся в базе из-за
 * уникального ограничения, и без него компания, отозвавшая предложение,
 * потеряла бы заказ навсегда (ТЗ §4.1).
 *
 * Поиск ищет по номеру и названию заказа, но не по подрядчику: у заказа
 * в ленте исполнителя нет по определению.
 */
export function buildAvailableOrdersWhere(
  companyId: string,
  query?: string,
): Prisma.OrderWhereInput {
  const availability: Prisma.OrderWhereInput = {
    OR: [
      { offers: { none: { companyId } } },
      { offers: { some: { companyId, status: { in: RESUBMITTABLE_STATUSES } } } },
    ],
  };

  // Условия складываются через `AND`, а не соседними ключами: и доступность,
  // и поиск — это `OR`, и один просто затёр бы другой.
  return {
    status: { in: ELIGIBLE_ORDER_STATUSES },
    AND: query
      ? [availability, { OR: buildSearchConditions(query, { includeContractor: false }) }]
      : [availability],
  };
}
