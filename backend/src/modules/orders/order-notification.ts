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

import type { Prisma } from '../../generated/prisma/client.js';

/** Заказ в том объёме, который нужен для подписи. */
export interface OrderRef {
  orderNumber: number;
  title: string;
}

/** `ORD-7829 «Ремонт квартиры»`. */
export function orderRef(order: OrderRef): string {
  return `${formatOrderNumber(order.orderNumber)} «${order.title}»`;
}

/**
 * Ключи схлопывания: о чём уведомление, если о том же придёт следующее.
 *
 * Непрочитанное уведомление с тем же адресатом и ключом новое заменяет
 * (`dropSupersededNotifications`). Иначе колокольчик копил бы повторы:
 * компания правит или заново отправляет предложение сколько угодно раз —
 * до тридцати в минуту, — и каждое сохранение давало клиенту новую строку.
 * Адресату нужно последнее состояние, а не каждая промежуточная правка.
 *
 * Ключ предложения один на все его уведомления: отзыв заменяет непрочитанное
 * «новое предложение», повторная отправка — непрочитанный отзыв.
 */
export const notificationKeys = {
  offer: (offerId: string) => `offer:${offerId}`,
  orderFiles: (orderId: string) => `files:${orderId}`,
  orderArea: (orderId: string) => `area:${orderId}`,
};

/** Адресат и ключ будущего уведомления. */
interface CollapsibleDraft {
  userId: string;
  collapseKey?: string | null;
}

/**
 * Убрать непрочитанные уведомления, которые заменят `drafts`.
 *
 * Зовётся той же транзакцией, что и запись новых, под блокировкой заказа:
 * два перехода одного заказа не пересекаются, и повтор не проскочит.
 * Прочитанные остаются — это история, а не очередь.
 */
export async function dropSupersededNotifications(
  tx: Prisma.TransactionClient,
  drafts: CollapsibleDraft[],
): Promise<void> {
  const keyed = drafts.flatMap(({ userId, collapseKey }) =>
    collapseKey ? [{ userId, collapseKey }] : [],
  );

  if (keyed.length === 0) return;

  await tx.notification.deleteMany({ where: { isRead: false, OR: keyed } });
}
