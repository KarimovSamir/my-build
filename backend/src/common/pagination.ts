/**
 * Разбивка списков на страницы (ТЗ §5: пагинация обязательна для всех списков).
 *
 * Границы значений проверяет DTO (`common/dto/pagination.dto.ts`); здесь
 * только арифметика, одинаковая для любого списка.
 */

import { DEFAULT_PAGE_SIZE, type Paginated } from '@mybuild/shared';

export interface PageRequest {
  page: number;
  pageSize: number;
  skip: number;
}

/** Номер страницы, её размер и смещение для запроса. */
export function pageRequest(query: { page?: number; pageSize?: number }): PageRequest {
  const page = query.page || 1;
  const pageSize = query.pageSize || DEFAULT_PAGE_SIZE;

  return { page, pageSize, skip: (page - 1) * pageSize };
}

/**
 * Собрать ответ-страницу. `totalPages` не меньше единицы: пустой список —
 * это одна пустая страница, а не ноль страниц, иначе пагинация на фронте
 * показывает «страница 1 из 0».
 */
export function toPage<T>(
  items: T[],
  { page, pageSize }: PageRequest,
  total: number,
): Paginated<T> {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
