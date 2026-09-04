/**
 * Правила комментариев при приёмке работы (ТЗ §4, §5).
 *
 * Зеркало `ConfirmOrderDto` и `DisputeOrderDto`: длины берутся из `shared/`,
 * поэтому форма и backend не могут разойтись. Разница между двумя проверками
 * ровно одна — при доработке комментарий обязателен: он и есть её содержание,
 * без него компания не узнает, что переделывать.
 *
 * Модуль чистый — ни React, ни fetch.
 */

import { ORDER_LIMITS } from "@/lib/types";

const TOO_LONG = `Комментарий — не более ${ORDER_LIMITS.comment.max} символов`;

/** Комментарий при подтверждении выполнения. Необязателен. */
export function validateCompletionComment(value: string): string | undefined {
  return value.trim().length > ORDER_LIMITS.comment.max ? TOO_LONG : undefined;
}

/** Комментарий к доработке. Обязателен. */
export function validateCorrectionComment(value: string): string | undefined {
  const comment = value.trim();

  if (comment.length < ORDER_LIMITS.comment.min) {
    return "Опишите, что нужно доработать";
  }

  return comment.length > ORDER_LIMITS.comment.max ? TOO_LONG : undefined;
}
