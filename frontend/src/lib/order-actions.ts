/**
 * Что клиент может сделать с заказом прямо сейчас (ТЗ §4, §4.1).
 *
 * Состав кнопок считается той же функцией, что решает на сервере, — общей
 * `canTransition` из `shared/`. Написать здесь свои условия («статус
 * AWAITING_CONFIRMATION — значит, показываем принять») значило бы завести
 * второй свод правил: разойдись он с машиной, пользователь увидит кнопку,
 * на которую сервер отвечает 409.
 *
 * Статус предложения передаётся третьим аргументом обязательно: без него
 * «Отклонить» появится и у предложения, отклонённого минуту назад.
 *
 * Модуль чистый: ни React, ни fetch.
 */

import {
  OrderEventType,
  canTransition,
  isExecutorOffer,
  isPendingOffer,
  type OfferDto,
  type OrderDetail,
} from "@/lib/types";

import type { OrderDetailAccess } from "./order-access";

/** Предложение и решения, которые клиент может по нему принять. */
export interface OfferDecision {
  offer: OfferDto;
  canAccept: boolean;
  canReject: boolean;
}

export interface OrderClientActions {
  /** Предложения, ждущие выбора клиента. */
  decisions: OfferDecision[];
  /** Предложение, по которому заказ исполняется: принятое, сданное, завершённое. */
  executorOffer: OfferDto | null;
  canConfirmWork: boolean;
  canDisputeWork: boolean;
}

const NOTHING: OrderClientActions = {
  decisions: [],
  executorOffer: null,
  canConfirmWork: false,
  canDisputeWork: false,
};

export function resolveClientActions(
  order: OrderDetail,
  access: OrderDetailAccess,
): OrderClientActions {
  // Проверка владения здесь не лишняя: своё собственное предложение в статусе
  // `SENT` компания видит в том же поле `offers`, и по одним лишь статусам
  // она получила бы кнопку «Принять» на саму себя.
  if (!access.isOwner) return NOTHING;

  const decisions = order.offers.filter((offer) => isPendingOffer(offer.status)).map(
    (offer): OfferDecision => ({
      offer,
      canAccept: canTransition(
        order.status,
        OrderEventType.OFFER_ACCEPTED,
        offer.status,
      ),
      canReject: canTransition(
        order.status,
        OrderEventType.OFFER_REJECTED,
        offer.status,
      ),
    }),
  );

  const executorOffer =
    order.offers.find((offer) => isExecutorOffer(offer.status)) ?? null;

  return {
    decisions,
    executorOffer,
    canConfirmWork:
      executorOffer !== null &&
      canTransition(order.status, OrderEventType.WORK_CONFIRMED, executorOffer.status),
    canDisputeWork:
      executorOffer !== null &&
      canTransition(order.status, OrderEventType.WORK_DISPUTED, executorOffer.status),
  };
}
