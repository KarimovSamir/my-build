/**
 * Как заказ подписан в уведомлении (ТЗ §8).
 *
 * Вынесено из state-машины, потому что уведомления создаёт не только она:
 * добавление файлов и уточнение площади статус не меняют, а сообщить о них
 * клиенту обязаны. Два независимых способа собрать одну и ту же строку рано
 * или поздно разошлись бы, и пользователь получал бы уведомления в двух
 * разных форматах.
 */

import { formatOrderNumber } from '@mybuild/shared';

/** Заказ в том объёме, который нужен для подписи. */
export interface OrderRef {
  orderNumber: number;
  title: string;
}

/** `ORD-7829 «Ремонт квартиры»`. */
export function orderRef(order: OrderRef): string {
  return `${formatOrderNumber(order.orderNumber)} «${order.title}»`;
}
