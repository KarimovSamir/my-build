/**
 * Ответ API в виде текста для пользователя.
 *
 * Правило одно на все формы и диалоги: сообщение сервера показывается как есть.
 * Подменять его на «что-то пошло не так» нельзя — за 409 стоит настоящая
 * причина («заказ уже в работе»), и она человеку нужнее общей фразы. Своим
 * текстом заменяются только два случая: до сервера не дошли вовсе и сессия
 * истекла.
 *
 * Модуль чистый — ни React, ни fetch.
 */

import { ApiRequestError } from "./api";

const SESSION_EXPIRED = "Сессия истекла. Войдите заново";

/**
 * Сообщения об ошибке списком: валидация приходит несколькими строками,
 * и форма показывает их все.
 */
export function apiErrorMessages(error: unknown, fallback: string): string[] {
  if (!(error instanceof ApiRequestError)) {
    return [fallback];
  }

  if (error.statusCode === 401) {
    return [SESSION_EXPIRED];
  }

  const messages = error.validationMessages;

  return messages.length > 0 ? messages : [error.message];
}

/** То же одной строкой — для тоста, в который список не поместить. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessages(error, fallback).join(". ");
}
