/**
 * Кто считается участником заказа (ТЗ §4.1, «Приватность и видимость»).
 *
 * Наборы статусов вынесены отдельно и без зависимостей от Nest: их читают
 * и модуль заказов, и модуль файлов, а два независимых списка одних и тех же
 * статусов рано или поздно разошлись бы.
 */

import { OfferStatus } from '@mybuild/shared';

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
