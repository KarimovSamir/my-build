import { describe, expect, it } from "vitest";

import { isPendingOffer, OfferStatus } from "@/lib/types";

import { offerDate, offerHint } from "./offer-view";

const ORDER_ID = "9f1f3f4e-0000-4000-8000-000000000002";

describe("offerHint", () => {
  it("у предложения, ждущего выбора клиента, подсказки нет — там кнопки", () => {
    expect(offerHint(OfferStatus.SENT, ORDER_ID)).toBeNull();
    expect(isPendingOffer(OfferStatus.SENT)).toBe(true);
  });

  it.each(
    Object.values(OfferStatus).filter((status) => status !== OfferStatus.SENT),
  )("объясняет статус %s", (status) => {
    // Каждый статус, кроме отправленного, обязан что-то сказать: иначе
    // строка выглядит так, будто по ней просто нечего делать.
    expect(offerHint(status, ORDER_ID)?.text).toBeTruthy();
  });

  it.each([
    OfferStatus.ACCEPTED,
    OfferStatus.WORK_SUBMITTED,
    OfferStatus.BACK_FOR_OVERRIDE,
    OfferStatus.COMPLETED,
  ])("из статуса исполнителя (%s) ведёт на страницу заказа", (status) => {
    expect(offerHint(status, ORDER_ID)?.link?.href).toBe(`/orders/${ORDER_ID}`);
  });

  it.each([OfferStatus.REJECTED, OfferStatus.WITHDRAWN])(
    "после статуса %s отправляет в ленту, пока отправить заново нельзя",
    (status) => {
      // Права на новое предложение у списка «Мои предложения» нет: там заказ
      // приходит строкой списка, без `canSubmitOffer`.
      expect(offerHint(status, ORDER_ID)?.link?.href).toBe("/available");
    },
  );

  it.each([OfferStatus.REJECTED, OfferStatus.WITHDRAWN])(
    "после статуса %s не зовёт в ленту, если предложение можно отправить прямо здесь",
    (status) => {
      const hint = offerHint(status, ORDER_ID, true);

      expect(hint?.text).toBeTruthy();
      expect(hint?.link).toBeUndefined();
    },
  );

  it("проигравшему предложению никуда идти не предлагает", () => {
    expect(offerHint(OfferStatus.NOT_ACCEPTED, ORDER_ID)?.link).toBeUndefined();
  });
});

describe("offerDate", () => {
  const CREATED = "2026-09-01T10:00:00.000Z";
  const UPDATED = "2026-09-03T18:30:00.000Z";

  it("нетронутое предложение подписывается датой отправки", () => {
    expect(offerDate({ createdAt: CREATED, updatedAt: CREATED })).toEqual({
      label: "Предложение от",
      iso: CREATED,
    });
  });

  it("изменённое — датой изменения: цена и срок в строке уже новые", () => {
    // Отправка предложения по ТЗ §4.1 — upsert, и `createdAt` после неё
    // относится к прежним условиям, которых клиент уже не видит.
    expect(offerDate({ createdAt: CREATED, updatedAt: UPDATED })).toEqual({
      label: "Обновлено",
      iso: UPDATED,
    });
  });
});
