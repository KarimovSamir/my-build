/**
 * Правила формы создания заказа (ТЗ §4.1).
 *
 * Зеркало `CreateOrderDto`: числа и шаблоны берутся из `shared/`, поэтому
 * форма и backend не могут разойтись в том, что считать допустимым. Проверка
 * здесь — про удобство (ошибка под полем вместо ответа 400), а не про
 * безопасность: решает всё равно backend.
 *
 * Модуль чистый — ни React, ни fetch: то же самое можно вызвать откуда угодно.
 */

import {
  ALLOWED_FILE_EXTENSIONS,
  ALLOWED_FILE_EXTENSIONS_HINT,
  MAX_FILES_PER_REQUEST,
  MAX_FILE_SIZE_BYTES,
  MONEY_PATTERN,
  ORDER_LIMITS,
  fileExtension,
  type ObjectType,
  type OrderCategory,
} from "@/lib/types";

import { isCalendarDate, isPastDate, normalizeNumber } from "./form-input";

/** Значения полей формы. Всё строками — так их отдаёт браузер. */
export interface OrderFormValues {
  title: string;
  /** Пустая строка — «ещё не выбрано». */
  category: OrderCategory | "";
  objectType: ObjectType | "";
  description: string;
  /** Число строкой; запятая допускается и превращается в точку при отправке. */
  squareMeters: string;
  clientBudget: string;
  /** Календарная дата `ГГГГ-ММ-ДД`. */
  desiredStartDate: string;
  address: string;
}

export type OrderFormField = keyof OrderFormValues;

export type OrderFormErrors = Partial<Record<OrderFormField, string>>;

export const emptyOrderForm: OrderFormValues = {
  title: "",
  category: "",
  objectType: "",
  description: "",
  squareMeters: "",
  clientBudget: "",
  desiredStartDate: "",
  address: "",
};

/** Проверка всей формы. Пустой объект — можно отправлять. */
export function validateOrderForm(values: OrderFormValues): OrderFormErrors {
  const errors: OrderFormErrors = {};

  const title = values.title.trim();
  if (!title) {
    errors.title = "Укажите название заказа";
  } else if (outOfRange(title, ORDER_LIMITS.title)) {
    errors.title = lengthMessage("Название заказа", ORDER_LIMITS.title);
  }

  if (!values.category) errors.category = "Выберите категорию заказа";
  if (!values.objectType) errors.objectType = "Выберите тип объекта";

  const description = values.description.trim();
  if (!description) {
    errors.description = "Опишите, что нужно сделать";
  } else if (outOfRange(description, ORDER_LIMITS.description)) {
    errors.description = lengthMessage("Описание работ", ORDER_LIMITS.description);
  }

  const address = values.address.trim();
  if (!address) {
    errors.address = "Укажите адрес объекта";
  } else if (outOfRange(address, ORDER_LIMITS.address)) {
    errors.address = lengthMessage("Адрес объекта", ORDER_LIMITS.address);
  }

  const squareMeters = validateSquareMeters(values.squareMeters);
  if (squareMeters) errors.squareMeters = squareMeters;

  // Запятая допускается так же, как в площади: соседние поля не должны
  // вести себя по-разному — «45000,50» форма отклоняла, «62,5» принимала.
  const budget = normalizeNumber(values.clientBudget);
  if (budget && !MONEY_PATTERN.test(budget)) {
    errors.clientBudget = "Бюджет — сумма вида 150000 или 150000.50";
  }

  const date = values.desiredStartDate.trim();
  if (date && !isCalendarDate(date)) {
    errors.desiredStartDate = "Некорректная желаемая дата начала";
  } else if (date && isPastDate(date)) {
    errors.desiredStartDate = "Желаемая дата начала не может быть в прошлом";
  }

  return errors;
}

/**
 * Тело запроса `POST /orders`.
 *
 * Именно `FormData`: маршрут принимает multipart, потому что вместе с полями
 * уходят файлы. Незаполненные необязательные поля не отправляются вовсе —
 * `ValidationPipe` настроен на `forbidNonWhitelisted`, и лишнего в теле
 * быть не должно.
 */
export function toOrderFormData(values: OrderFormValues, files: File[]): FormData {
  const body = new FormData();

  body.set("title", values.title.trim());
  body.set("category", values.category);
  body.set("objectType", values.objectType);
  body.set("description", values.description.trim());
  body.set("address", values.address.trim());
  body.set("squareMeters", normalizeNumber(values.squareMeters));

  const budget = normalizeNumber(values.clientBudget);
  if (budget) body.set("clientBudget", budget);

  const date = values.desiredStartDate.trim();
  if (date) body.set("desiredStartDate", date);

  for (const file of files) {
    body.append("files", file);
  }

  return body;
}

/** Почему файл нельзя приложить. `null` — можно. */
export function fileRejectionReason(file: File): string | null {
  if (!ALLOWED_FILE_EXTENSIONS.includes(fileExtension(file.name))) {
    return `«${file.name}»: такой тип загрузить нельзя. Разрешены ${ALLOWED_FILE_EXTENSIONS_HINT}`;
  }

  if (file.size === 0) {
    return `«${file.name}»: файл пустой`;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `«${file.name}»: больше ${MAX_FILE_SIZE_BYTES / 1024 / 1024} МБ`;
  }

  return null;
}

/**
 * Добавить выбранные файлы к уже приложенным.
 *
 * Возвращает и новый список, и причины отказов — их показывает dropzone.
 * Повторно выбранный файл (то же имя и размер) не дублируется: backend всё
 * равно отбросит его по хешу, но пользователю видеть две одинаковые строки
 * незачем.
 */
export function addFiles(
  current: File[],
  incoming: File[],
): { files: File[]; rejected: string[] } {
  const files = [...current];
  const rejected: string[] = [];

  for (const file of incoming) {
    const reason = fileRejectionReason(file);
    if (reason) {
      rejected.push(reason);
      continue;
    }

    if (files.some((kept) => kept.name === file.name && kept.size === file.size)) {
      continue;
    }

    if (files.length >= MAX_FILES_PER_REQUEST) {
      rejected.push(`Больше ${MAX_FILES_PER_REQUEST} файлов за раз приложить нельзя`);
      break;
    }

    files.push(file);
  }

  return { files, rejected };
}

/**
 * Проверка площади. `undefined` — значение годится.
 *
 * Общая для заказа и для уточнения исполнителем: это одна и та же величина,
 * просто посчитанная другой стороной, и границы у неё те же
 * (`ORDER_LIMITS.squareMeters`, `VerifiedAreaDto`).
 */
export function validateSquareMeters(raw: string): string | undefined {
  const value = normalizeNumber(raw);

  if (!value) return "Укажите площадь объекта";

  if (!/^\d+(\.\d+)?$/.test(value)) {
    return "Площадь — число, например 100 или 62.5";
  }

  const decimals = value.split(".")[1]?.length ?? 0;
  if (decimals > ORDER_LIMITS.squareMeters.maxDecimals) {
    return "Площадь — число, не более двух знаков после запятой";
  }

  const parsed = Number(value);
  if (parsed <= 0) return "Площадь должна быть больше нуля";
  if (parsed > ORDER_LIMITS.squareMeters.max) {
    return "Площадь не может быть больше 1 000 000 м²";
  }

  return undefined;
}

function outOfRange(value: string, limits: { min: number; max: number }): boolean {
  return value.length < limits.min || value.length > limits.max;
}

function lengthMessage(field: string, limits: { min: number; max: number }): string {
  return `${field} — от ${limits.min} до ${limits.max} символов`;
}
