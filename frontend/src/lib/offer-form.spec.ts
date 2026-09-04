import { describe, expect, it } from "vitest";

import { OfferStatus, OFFER_LIMITS, type OfferDto } from "@/lib/types";

import { todayIsoDate } from "./form-input";
import {
  emptyOfferForm,
  offerFormValues,
  toOfferBody,
  validateOfferForm,
  type OfferFormValues,
} from "./offer-form";

/** Заведомо правильная форма: от неё отталкиваются проверки отдельных полей. */
const validForm: OfferFormValues = {
  proposedPrice: "150000",
  proposedDeadline: "2099-12-31",
  comment: "Начнём в понедельник",
};

function form(patch: Partial<OfferFormValues>): OfferFormValues {
  return { ...validForm, ...patch };
}

/** Дата со сдвигом от сегодняшнего дня по UTC — той же границей меряет backend. */
function isoDateShifted(days: number): string {
  const date = new Date(`${todayIsoDate()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

describe("validateOfferForm", () => {
  it("правильно заполненную форму пропускает", () => {
    expect(validateOfferForm(validForm)).toEqual({});
  });

  it("на пустой форме сообщает про цену и срок", () => {
    const errors = validateOfferForm(emptyOfferForm);

    expect(errors.proposedPrice).toBe("Укажите цену");
    expect(errors.proposedDeadline).toBe("Укажите срок выполнения");
    // Комментарий по ТЗ §4.1 необязателен.
    expect(errors.comment).toBeUndefined();
  });

  it("принимает цену с запятой", () => {
    expect(validateOfferForm(form({ proposedPrice: "150000,50" })).proposedPrice)
      .toBeUndefined();
  });

  it("не принимает нулевую и неправильную цену", () => {
    // Работа за ноль — ошибка ввода, а не предложение (`OFFER_PRICE_PATTERN`).
    for (const proposedPrice of ["0", "0.00", "-100", "дорого", "150000.505"]) {
      expect(validateOfferForm(form({ proposedPrice })).proposedPrice).toBeDefined();
    }
  });

  it("проверяет срок выполнения", () => {
    expect(validateOfferForm(form({ proposedDeadline: "31.12.2099" })).proposedDeadline)
      .toBe("Некорректный срок выполнения");
    expect(validateOfferForm(form({ proposedDeadline: isoDateShifted(-1) })).proposedDeadline)
      .toBe("Срок выполнения не может быть в прошлом");
    expect(validateOfferForm(form({ proposedDeadline: todayIsoDate() })).proposedDeadline)
      .toBeUndefined();
  });

  it("ограничивает длину комментария так же, как backend", () => {
    const max = OFFER_LIMITS.comment.max;

    expect(validateOfferForm(form({ comment: "я".repeat(max) })).comment).toBeUndefined();
    expect(validateOfferForm(form({ comment: "я".repeat(max + 1) })).comment).toBeDefined();
  });
});

describe("offerFormValues", () => {
  const offer: OfferDto = {
    id: "9f1f3f4e-0000-4000-8000-000000000001",
    orderId: "9f1f3f4e-0000-4000-8000-000000000002",
    companyId: "9f1f3f4e-0000-4000-8000-000000000003",
    companyName: "СтройГрад",
    status: OfferStatus.SENT,
    proposedPrice: "150000.50",
    proposedDeadline: "2099-12-31T00:00:00.000Z",
    comment: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
  };

  it("подставляет отправленное предложение, срок — календарной датой", () => {
    expect(offerFormValues(offer)).toEqual({
      proposedPrice: "150000.50",
      proposedDeadline: "2099-12-31",
      comment: "",
    });
  });

  it("без предложения даёт пустую форму", () => {
    expect(offerFormValues(null)).toEqual(emptyOfferForm);
  });
});

describe("toOfferBody", () => {
  const orderId = "9f1f3f4e-0000-4000-8000-000000000002";

  it("превращает запятую в точку и обрезает пробелы", () => {
    expect(
      toOfferBody(orderId, form({ proposedPrice: " 150000,50 ", comment: "  Срочно " })),
    ).toEqual({
      orderId,
      proposedPrice: "150000.50",
      proposedDeadline: "2099-12-31",
      comment: "Срочно",
    });
  });

  it("пустой комментарий не отправляет вовсе", () => {
    // `forbidNonWhitelisted` отклонил бы лишнее поле, а пустая строка
    // не прошла бы проверку длины.
    expect(toOfferBody(orderId, form({ comment: "   " }))).not.toHaveProperty("comment");
  });
});
