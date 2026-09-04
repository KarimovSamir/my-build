/**
 * Правила формы предложения (ТЗ §4.1).
 *
 * Зеркало `CreateOfferDto`: шаблон цены и длина комментария берутся из
 * `shared/`, поэтому форма и backend не могут разойтись в том, что считать
 * допустимым. Проверка здесь — про удобство (ошибка под полем вместо ответа
 * 400), а не про безопасность: решает всё равно backend.
 *
 * Модуль чистый — ни React, ни fetch.
 */

import { OFFER_LIMITS, OFFER_PRICE_PATTERN, type OfferDto } from "@/lib/types";

import { isCalendarDate, isPastDate, normalizeNumber } from "./form-input";

/** Значения полей формы. Всё строками — так их отдаёт браузер. */
export interface OfferFormValues {
  /** Сумма строкой; запятая допускается и превращается в точку при отправке. */
  proposedPrice: string;
  /** Календарная дата `ГГГГ-ММ-ДД`. */
  proposedDeadline: string;
  comment: string;
}

export type OfferFormField = keyof OfferFormValues;

export type OfferFormErrors = Partial<Record<OfferFormField, string>>;

export const emptyOfferForm: OfferFormValues = {
  proposedPrice: "",
  proposedDeadline: "",
  comment: "",
};

/**
 * Форма, заполненная уже отправленным предложением.
 *
 * Отправка предложения — upsert (ТЗ §4.1), и повторное открытие формы обязано
 * показывать то, что компания предложила в прошлый раз: иначе «изменить цену»
 * превращается в «вспомнить и ввести всё заново».
 */
export function offerFormValues(offer: OfferDto | null): OfferFormValues {
  if (!offer) return emptyOfferForm;

  return {
    proposedPrice: offer.proposedPrice,
    // Срок приходит моментом времени ISO — календарю нужна только дата.
    proposedDeadline: offer.proposedDeadline.slice(0, 10),
    comment: offer.comment ?? "",
  };
}

/** Проверка всей формы. Пустой объект — можно отправлять. */
export function validateOfferForm(values: OfferFormValues): OfferFormErrors {
  const errors: OfferFormErrors = {};

  const price = normalizeNumber(values.proposedPrice);
  if (!price) {
    errors.proposedPrice = "Укажите цену";
  } else if (!OFFER_PRICE_PATTERN.test(price)) {
    // Ноль шаблон не пропускает намеренно: работа за ноль — ошибка ввода.
    errors.proposedPrice = "Цена — сумма больше нуля, вида 150000 или 150000.50";
  }

  const deadline = values.proposedDeadline.trim();
  if (!deadline) {
    errors.proposedDeadline = "Укажите срок выполнения";
  } else if (!isCalendarDate(deadline)) {
    errors.proposedDeadline = "Некорректный срок выполнения";
  } else if (isPastDate(deadline)) {
    errors.proposedDeadline = "Срок выполнения не может быть в прошлом";
  }

  if (values.comment.trim().length > OFFER_LIMITS.comment.max) {
    errors.comment = `Комментарий — не более ${OFFER_LIMITS.comment.max} символов`;
  }

  return errors;
}

/** Тело запроса `POST /offers`. */
export interface OfferRequestBody {
  orderId: string;
  proposedPrice: string;
  proposedDeadline: string;
  comment?: string;
}

/**
 * Тело запроса из значений формы.
 *
 * Пустой комментарий не отправляется вовсе: `ValidationPipe` настроен на
 * `forbidNonWhitelisted`, и лишнего в теле быть не должно.
 */
export function toOfferBody(orderId: string, values: OfferFormValues): OfferRequestBody {
  const comment = values.comment.trim();

  return {
    orderId,
    proposedPrice: normalizeNumber(values.proposedPrice),
    proposedDeadline: values.proposedDeadline.trim(),
    ...(comment ? { comment } : {}),
  };
}
