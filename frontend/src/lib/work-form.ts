/**
 * Правила форм компании-исполнителя: файлы сдачи и уточнение площади (ТЗ §4.1).
 *
 * Зеркало `SubmitFilesDto` и `VerifiedAreaDto`: длины и границы берутся
 * из `shared/`, поэтому форма и backend не могут разойтись в том, что считать
 * допустимым. Проверка здесь — про удобство (ошибка под полем вместо ответа
 * 400), а не про безопасность: решает всё равно backend.
 *
 * Модуль чистый — ни React, ни fetch.
 */

import { ORDER_LIMITS } from "@/lib/types";

import { normalizeNumber } from "./form-input";

export interface WorkFilesFormValues {
  comment: string;
  files: File[];
}

export type WorkFilesFormErrors = Partial<Record<"comment" | "files", string>>;

export const emptyWorkFilesForm: WorkFilesFormValues = { comment: "", files: [] };

/**
 * Проверка формы загрузки. Пустой объект — можно отправлять.
 *
 * Обязательны оба: и комментарий, и хотя бы один файл (ТЗ §4.1). Комментарий
 * проверяет DTO, обязательность файла — сервис, но пользователю разницы нет,
 * и обе ошибки показываются под своими полями.
 */
export function validateWorkFilesForm(values: WorkFilesFormValues): WorkFilesFormErrors {
  const errors: WorkFilesFormErrors = {};

  const comment = values.comment.trim();
  if (!comment) {
    errors.comment = "Опишите, что вы загружаете";
  } else if (comment.length > ORDER_LIMITS.comment.max) {
    errors.comment = `Комментарий — не более ${ORDER_LIMITS.comment.max} символов`;
  }

  if (values.files.length === 0) {
    errors.files = "Приложите хотя бы один файл";
  }

  return errors;
}

/**
 * Тело запроса `POST /orders/:id/files`.
 *
 * Именно `FormData`: маршрут принимает multipart, потому что вместе
 * с комментарием уходят файлы.
 */
export function toWorkFilesFormData(values: WorkFilesFormValues): FormData {
  const body = new FormData();

  body.set("comment", values.comment.trim());

  for (const file of values.files) {
    body.append("files", file);
  }

  return body;
}

/**
 * Тело запроса `PATCH /orders/:id/verified-area`.
 *
 * Площадь проверяется общей `validateSquareMeters`: это то же поле, что
 * и в заказе, просто заполняет его другая сторона.
 */
export function toVerifiedAreaBody(raw: string): { verifiedSquareMeters: number } {
  return { verifiedSquareMeters: Number(normalizeNumber(raw)) };
}
