/**
 * Что стороны могут сделать с заказом прямо сейчас (ТЗ §4, §4.1).
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
  canUploadWork,
  canVerifyArea,
  isExecutorOffer,
  isPendingOffer,
  type OfferDto,
  type OrderDetail,
} from "@/lib/types";

import type { OrderDetailAccess } from "./order-access";
import type { SubmissionsView } from "./submissions";

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

/** Что компания может сделать с заказом прямо сейчас (ТЗ §4.1). */
export interface OrderCompanyActions {
  /**
   * Своё предложение — единственное, которое компания вообще видит (ТЗ §4.1,
   * приватность). `null` — компания по заказу не предлагалась.
   */
  ownOffer: OfferDto | null;
  /** Предложение принято: заказ выполняет эта компания. */
  isExecutor: boolean;
  /** Можно добавить файлы в свою сдачу. */
  canAddFiles: boolean;
  /** Можно сдать работу клиенту. */
  canSubmitWork: boolean;
  /** Можно уточнить площадь объекта. */
  canVerifyArea: boolean;
}

const NOTHING_FOR_COMPANY: OrderCompanyActions = {
  ownOffer: null,
  isExecutor: false,
  canAddFiles: false,
  canSubmitWork: false,
  canVerifyArea: false,
};

/**
 * Действия компании по заказу.
 *
 * Клиенту здесь ловить нечего: своё предложение он не подаёт, а список чужих
 * разбирает `resolveClientActions`. Сдача работы — единственное место, где
 * к статусу заказа добавляется условие сверх таблицы переходов: сдавать нечего,
 * пока в открытом раунде нет ни одного файла. То же самое проверяет сервер
 * (409 «нечего сдавать»), и без этой проверки кнопка обещала бы невозможное.
 */
export function resolveCompanyActions(
  order: OrderDetail,
  access: OrderDetailAccess,
  submissions: SubmissionsView,
  /** Кто смотрит. `null` — сессия пропала между рендером и запросом. */
  viewerId: string | null,
): OrderCompanyActions {
  if (access.isOwner || viewerId === null) return NOTHING_FOR_COMPANY;

  const ownOffer = order.offers.find((offer) => offer.companyId === viewerId) ?? null;

  if (!ownOffer || !isExecutorOffer(ownOffer.status)) {
    return { ...NOTHING_FOR_COMPANY, ownOffer };
  }

  const open = submissions.open;

  return {
    ownOffer,
    isExecutor: true,
    canAddFiles: canUploadWork(order.status),
    canSubmitWork:
      canTransition(order.status, OrderEventType.WORK_SUBMITTED, ownOffer.status) &&
      open !== null &&
      open.files.length > 0,
    canVerifyArea: canVerifyArea(order.status),
  };
}
