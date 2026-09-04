/**
 * Кто считается участником заказа (ТЗ §4.1, «Приватность и видимость»).
 *
 * Наборы статусов лежат в `shared/`, потому что по ним решают обе стороны:
 * backend — что положить в ответ, интерфейс — что написать пользователю
 * («файлов нет» и «файлы видны только исполнителю» — разные вещи, а в ответе
 * API оба случая выглядят одинаково пустым списком).
 *
 * Списки выведены один из другого, а не написаны рядом: новый статус
 * исполнителя достаточно добавить в самый узкий из них, и он появится
 * во всех остальных.
 */

import { OfferStatus, OrderStatus } from './enums.js';

/**
 * Правила заполнения предложения (ТЗ §4.1). Цена и срок обязательны,
 * комментарий — нет. Те же числа проверяет DTO на backend и форма в браузере.
 */
export const OFFER_LIMITS = {
  comment: { max: 2000 },
} as const;

/**
 * Цена предложения: та же форма, что и у любой суммы (`Decimal(12, 2)`),
 * но строго больше нуля. Опережающая проверка требует хотя бы одной цифры,
 * кроме нуля, — иначе «0» и «0.00» проходили бы как обычная сумма, а работа
 * за ноль это не предложение, а ошибка ввода.
 */
export const OFFER_PRICE_PATTERN = /^(?=.*[1-9])\d{1,10}(\.\d{1,2})?$/;

/**
 * Статусы заказа, в которых он принимает предложения (ТЗ §4.1).
 *
 * По этому списку строится лента `GET /company/orders/available`, и он же
 * решает на фронте, показывать ли кнопку «Отправить предложение». Разойдись
 * они — компания видела бы кнопку, на которую сервер отвечает 409.
 */
export const OFFER_ELIGIBLE_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.WAITING,
  OrderStatus.AWAITING_CONFIRMATION,
];

/**
 * Статусы, из которых компания вправе прислать предложение заново.
 *
 * Строка `Offer` остаётся в базе из-за `@@unique([orderId, companyId])`,
 * поэтому «нет предложения» и «предложение отозвано» — разные условия, и
 * второе обязано попадать в ленту: иначе отозвавшая компания теряла бы
 * заказ навсегда (ТЗ §4.1).
 */
export const RESUBMITTABLE_OFFER_STATUSES: readonly OfferStatus[] = [
  OfferStatus.WITHDRAWN,
  OfferStatus.REJECTED,
];

/**
 * Компания исполняет заказ прямо сейчас: предложение принято, работа идёт,
 * сдана или вернулась на доработку. Завершённого заказа здесь нет — работать
 * по нему уже нечего.
 */
export const EXECUTING_OFFER_STATUSES: readonly OfferStatus[] = [
  OfferStatus.ACCEPTED,
  OfferStatus.WORK_SUBMITTED,
  OfferStatus.BACK_FOR_OVERRIDE,
];

/**
 * Компания — исполнитель заказа: её предложение приняли.
 *
 * `COMPLETED` добавлен к списку выше намеренно: после сдачи компания должна
 * сохранять доступ к заказу и к тому, что сама загружала.
 */
export const EXECUTOR_OFFER_STATUSES: readonly OfferStatus[] = [
  ...EXECUTING_OFFER_STATUSES,
  OfferStatus.COMPLETED,
];

/**
 * Предложение компании ещё в игре: либо ждёт выбора клиента, либо уже принято.
 * Отозванное, отклонённое и невыбранное сюда не входят — по ТЗ §4.1 такой
 * заказ для компании снова выглядит как чужой.
 */
export const ACTIVE_OFFER_STATUSES: readonly OfferStatus[] = [
  OfferStatus.SENT,
  ...EXECUTOR_OFFER_STATUSES,
];

export function isExecutorOffer(status: OfferStatus): boolean {
  return EXECUTOR_OFFER_STATUSES.includes(status);
}

export function isActiveOffer(status: OfferStatus): boolean {
  return ACTIVE_OFFER_STATUSES.includes(status);
}

/** Заказ ещё ищет исполнителя, то есть принимает предложения (ТЗ §4.1). */
export function acceptsOffers(status: OrderStatus): boolean {
  return OFFER_ELIGIBLE_ORDER_STATUSES.includes(status);
}

/**
 * Предложение ждёт выбора клиента.
 *
 * Из этого статуса — и только из него — компания вправе изменить своё
 * предложение или отозвать его: то же предусловие проверяет state-машина
 * (`OFFER_PRECONDITIONS` для `OFFER_WITHDRAWN`). Разойдись они — интерфейс
 * показал бы кнопку, на которую сервер отвечает 409.
 */
export function isPendingOffer(status: OfferStatus): boolean {
  return status === OfferStatus.SENT;
}

/** Предложение выбыло из выбора, и компания может прислать новое (ТЗ §4.1). */
export function canResubmitOffer(status: OfferStatus): boolean {
  return RESUBMITTABLE_OFFER_STATUSES.includes(status);
}
