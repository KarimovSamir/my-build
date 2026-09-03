/**
 * Кто считается участником заказа (ТЗ §4.1, «Приватность и видимость»).
 *
 * Наборы статусов лежат в `shared/`, потому что по ним решают обе стороны:
 * backend — что положить в ответ, интерфейс — что написать пользователю
 * («файлов нет» и «файлы видны только исполнителю» — разные вещи, а в ответе
 * API оба случая выглядят одинаково пустым списком).
 */

import { OfferStatus } from './enums.js';

/**
 * Компания — исполнитель заказа: её предложение приняли.
 *
 * `COMPLETED` входит намеренно: после сдачи компания должна сохранять доступ
 * к заказу и к тому, что сама загружала.
 */
export const EXECUTOR_OFFER_STATUSES: OfferStatus[] = [
  OfferStatus.ACCEPTED,
  OfferStatus.WORK_SUBMITTED,
  OfferStatus.BACK_FOR_OVERRIDE,
  OfferStatus.COMPLETED,
];

/**
 * Предложение компании ещё в игре: либо ждёт выбора клиента, либо уже принято.
 * Отозванное, отклонённое и невыбранное сюда не входят — по ТЗ §4.1 такой
 * заказ для компании снова выглядит как чужой.
 */
export const ACTIVE_OFFER_STATUSES: OfferStatus[] = [
  OfferStatus.SENT,
  ...EXECUTOR_OFFER_STATUSES,
];

export function isExecutorOffer(status: OfferStatus): boolean {
  return EXECUTOR_OFFER_STATUSES.includes(status);
}

export function isActiveOffer(status: OfferStatus): boolean {
  return ACTIVE_OFFER_STATUSES.includes(status);
}
