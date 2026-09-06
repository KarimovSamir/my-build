/**
 * Уведомление в интерфейсе: куда ведёт клик и как подписан колокольчик (ТЗ §7).
 *
 * Модуль чистый — ни React, ни fetch. Здесь ровно то, в чём легко ошибиться
 * молча: ссылка у уведомления без заказа и число на колокольчике, которое
 * не должно разносить шапку.
 */

import type { NotificationDto } from "@/lib/types";

/**
 * Куда ведёт уведомление. `null` — вести некуда: так приходит `ORDER_DELETED`
 * (заказа больше нет, `orderId` обнулён внешним ключом), и так же придёт любое
 * будущее уведомление не про заказ. Такая строка показывается без ссылки.
 */
export function notificationHref(
  notification: Pick<NotificationDto, "orderId">,
): string | null {
  return notification.orderId ? `/orders/${notification.orderId}` : null;
}

/** Больше этого числа колокольчик показывает «99+», а не настоящее значение. */
export const MAX_BELL_COUNT = 99;

/**
 * Число на колокольчике. `null` — непрочитанных нет, значка не рисуем вовсе:
 * ноль в кружке выглядит как уведомление, которого нет.
 *
 * Потолок нужен не для красоты: трёхзначное число растягивает кружок и рвёт
 * шапку, а разница между «сто двадцать» и «много» пользователю не нужна.
 */
export function formatUnreadCount(count: number): string | null {
  if (!Number.isFinite(count) || count < 1) return null;

  const whole = Math.floor(count);

  return whole > MAX_BELL_COUNT ? `${MAX_BELL_COUNT}+` : String(whole);
}

/**
 * Подпись колокольчика для читалки экрана: значок с числом виден глазами,
 * а озвучить его нечем — сам кружок помечен `aria-hidden`.
 */
export function bellLabel(count: number): string {
  const badge = formatUnreadCount(count);

  return badge ? `Уведомления, непрочитанных: ${badge}` : "Уведомления";
}
