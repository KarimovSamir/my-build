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
  /**
   * Комментарии вокруг сдачи работы: к сдаче (компания), к доработке и
   * к приёмке (клиент). Предел общий — это одно и то же поле для человека,
   * и разные лимиты у соседних форм выглядели бы случайностью.
   */
  comment: { min: 1, max: 2000 },
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

/**
 * Статусы, в которых компания-исполнитель добавляет файлы своей сдачи (ТЗ §4.1).
 *
 * `AWAITING_COMPLETION_CONFIRMATION` сюда не входит: работа уже передана
 * клиенту, и дозагрузка молча меняла бы то, что он в этот момент проверяет.
 * Чтобы приложить забытый файл, компании нужна новая сдача — то есть сначала
 * решение клиента.
 */
export const WORK_UPLOAD_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.IN_PROGRESS,
  OrderStatus.COMPLETION_DISPUTED,
];

/**
 * Статусы, в которых компания-исполнитель уточняет площадь (ТЗ §4.1):
 * после принятия предложения и до завершения заказа.
 */
export const AREA_VERIFIABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.IN_PROGRESS,
  OrderStatus.AWAITING_COMPLETION_CONFIRMATION,
  OrderStatus.COMPLETION_DISPUTED,
];

/** Компания может добавить файлы в свою текущую сдачу. */
export function canUploadWork(status: OrderStatus): boolean {
  return WORK_UPLOAD_ORDER_STATUSES.includes(status);
}

/** Компания может уточнить площадь объекта. */
export function canVerifyArea(status: OrderStatus): boolean {
  return AREA_VERIFIABLE_ORDER_STATUSES.includes(status);
}
