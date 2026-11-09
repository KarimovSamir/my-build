import { formatOrderNumber } from './labels.js';

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

