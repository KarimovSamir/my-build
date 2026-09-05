/**
 * Таблицы state-машины заказа (ТЗ §4) — то, что обязаны знать обе стороны.
 *
 * Сама машина живёт на backend: там обработчики переходов, побочные эффекты
 * и транзакция. Здесь только правила «какое событие вообще допустимо» —
 * ровно то, по чему интерфейс решает, показывать кнопку или нет.
 *
 * Почему в `shared/`, а не двумя копиями: разойдись эти правила — пользователь
 * увидит кнопку, на которую сервер отвечает 409, и наоборот. Backend строит
 * свою таблицу обработчиков по `ORDER_TRANSITIONS` и не соберётся, если
 * обработчик лишний или забыт, — источник правды остаётся один.
 *
 * Модуль чистый: ни Nest, ни React, ни базы.
 */

import { OfferStatus, OrderStatus } from './enums.js';
import { RESUBMITTABLE_OFFER_STATUSES } from './offers.js';

/** События, которые двигают заказ по статусам (ТЗ §4). */
export const OrderEventType = {
  /** Компания отправила или обновила предложение. */
  OFFER_SUBMITTED: 'OFFER_SUBMITTED',
  /** Компания отозвала своё предложение. */
  OFFER_WITHDRAWN: 'OFFER_WITHDRAWN',
  /** Клиент отклонил предложение. */
  OFFER_REJECTED: 'OFFER_REJECTED',
  /** Клиент принял предложение. */
  OFFER_ACCEPTED: 'OFFER_ACCEPTED',
  /** Компания сдала работу (первая сдача или пересдача после доработки). */
  WORK_SUBMITTED: 'WORK_SUBMITTED',
  /** Клиент подтвердил выполнение. */
  WORK_CONFIRMED: 'WORK_CONFIRMED',
  /** Клиент отправил работу на доработку. */
  WORK_DISPUTED: 'WORK_DISPUTED',
} as const;
export type OrderEventType = (typeof OrderEventType)[keyof typeof OrderEventType];

/**
 * Таблица переходов ТЗ §4: какие события допустимы в каждом статусе.
 * Всё, чего здесь нет, — ошибка 409.
 *
 * `as const` не для красоты: из литеральных списков backend выводит тип своей
 * таблицы обработчиков, и только поэтому лишний или пропущенный обработчик
 * ловится компилятором, а не тестом.
 */
export const ORDER_TRANSITIONS = {
  [OrderStatus.WAITING]: [OrderEventType.OFFER_SUBMITTED],

  [OrderStatus.AWAITING_CONFIRMATION]: [
    // Заказ уже в этом статусе, но событие разрешено: предложение от ещё
    // одной компании — норма, а не конфликт (ТЗ §4.1).
    OrderEventType.OFFER_SUBMITTED,
    OrderEventType.OFFER_WITHDRAWN,
    OrderEventType.OFFER_REJECTED,
    OrderEventType.OFFER_ACCEPTED,
  ],

  [OrderStatus.IN_PROGRESS]: [OrderEventType.WORK_SUBMITTED],

  [OrderStatus.AWAITING_COMPLETION_CONFIRMATION]: [
    OrderEventType.WORK_CONFIRMED,
    OrderEventType.WORK_DISPUTED,
  ],

  // Пересдача после доработки.
  [OrderStatus.COMPLETION_DISPUTED]: [OrderEventType.WORK_SUBMITTED],

  // Терминальный статус: из завершённого заказа выходов нет.
  [OrderStatus.COMPLETED]: [],
} as const satisfies Record<OrderStatus, readonly OrderEventType[]>;

/** События, допустимые в конкретном статусе, — как тип. */
export type AllowedOrderEvent<S extends OrderStatus> =
  (typeof ORDER_TRANSITIONS)[S][number];

/**
 * Статусы предложения, из которых событие имеет смысл.
 *
 * Статус заказа этого не заменяет: пока заказ ждёт выбора из нескольких
 * предложений, он остаётся в `AWAITING_CONFIRMATION` — и без этой таблицы
 * одно и то же предложение можно было бы отклонить дважды.
 *
 * `OFFER_SUBMITTED` разрешён из трёх статусов: предложение можно обновить,
 * пока оно ждёт выбора, и прислать заново после собственного отзыва или отказа
 * клиента. Второе берётся из `RESUBMITTABLE_OFFER_STATUSES` — того же списка,
 * по которому строится лента доступных заказов: разойдись они, компания либо
 * видела бы в ленте заказ, на который сервер отвечает 409, либо наоборот.
 *
 * `NOT_ACCEPTED` в этом списке отсутствует намеренно: проиграть выбор
 * предложение может только вместе с уходом заказа в работу, а оттуда заказ
 * в `WAITING`/`AWAITING_CONFIRMATION` уже не возвращается — предлагаться
 * по нему некуда. Появись расторжение сделки, возвращающее заказ в поиск
 * исполнителя, статус придётся вернуть в оба списка сразу.
 */
export const OFFER_PRECONDITIONS: Record<OrderEventType, readonly OfferStatus[]> = {
  [OrderEventType.OFFER_SUBMITTED]: [
    OfferStatus.SENT,
    ...RESUBMITTABLE_OFFER_STATUSES,
  ],
  [OrderEventType.OFFER_WITHDRAWN]: [OfferStatus.SENT],
  [OrderEventType.OFFER_REJECTED]: [OfferStatus.SENT],
  [OrderEventType.OFFER_ACCEPTED]: [OfferStatus.SENT],
  [OrderEventType.WORK_SUBMITTED]: [OfferStatus.ACCEPTED, OfferStatus.BACK_FOR_OVERRIDE],
  [OrderEventType.WORK_CONFIRMED]: [OfferStatus.WORK_SUBMITTED],
  [OrderEventType.WORK_DISPUTED]: [OfferStatus.WORK_SUBMITTED],
};

/**
 * Разрешено ли событие. Для показа кнопок в интерфейсе и для `can()`
 * state-машины — считает их одна и та же функция.
 *
 * Статус предложения необязателен, но его стоит передавать везде, где кнопка
 * относится к конкретному предложению: без него ответ учитывает только статус
 * заказа, и в `AWAITING_CONFIRMATION` кнопка «Отклонить» покажется даже
 * у предложения, отклонённого минуту назад, — а сервер ответит 409.
 * `null` означает «предложения ещё нет» и предусловий не имеет.
 */
export function canTransition(
  status: OrderStatus,
  event: OrderEventType,
  offerStatus?: OfferStatus | null,
): boolean {
  const allowed: readonly OrderEventType[] = ORDER_TRANSITIONS[status];

  if (!allowed.includes(event)) {
    return false;
  }

  if (offerStatus === undefined || offerStatus === null) {
    return true;
  }

  return OFFER_PRECONDITIONS[event].includes(offerStatus);
}
