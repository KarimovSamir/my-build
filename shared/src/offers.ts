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

import { OfferStatus } from './enums.js';

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
