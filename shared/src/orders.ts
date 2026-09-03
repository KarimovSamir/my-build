/**
 * Правила заполнения заказа (ТЗ §4.1).
 *
 * Одни и те же числа проверяет DTO на backend и форма в браузере. Держать их
 * в двух местах нельзя: разъехавшись, они дадут либо форму, которая пропускает
 * заведомо отклоняемое, либо форму, которая запрещает разрешённое.
 */

import { OrderStatus } from './enums.js';

export const ORDER_LIMITS = {
  title: { min: 3, max: 200 },
  description: { min: 10, max: 5000 },
  address: { min: 5, max: 300 },
  /** Площадь: число больше нуля, не более двух знаков после запятой. */
  squareMeters: { max: 1_000_000, maxDecimals: 2 },
} as const;

/** Сумма в формате колонки БД: `Decimal(12, 2)`. */
export const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

/**
 * Статусы, в которых заказ ещё можно удалить: работы не начинались (ТЗ §4.1).
 *
 * Список общий с фронтом: по нему backend отвечает 409, а страница заказа
 * решает, показывать ли кнопку «Удалить». Разойдись они — пользователь видел бы
 * кнопку, которая гарантированно отдаёт ошибку.
 */
export const DELETABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.WAITING,
  OrderStatus.AWAITING_CONFIRMATION,
];

export function canDeleteOrder(status: OrderStatus): boolean {
  return DELETABLE_ORDER_STATUSES.includes(status);
}
