import { describe, expect, it } from "vitest";

import { isPendingOffer, OfferStatus } from "@/lib/types";

import { offerHint } from "./offer-view";

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
    "после статуса %s отправляет в ленту, а не предлагает кнопку",
    (status) => {
      // Настоящий статус заказа компании не виден: кнопка «Отправить заново»
      // обещала бы то, на что сервер может ответить 409.
      expect(offerHint(status, ORDER_ID)?.link?.href).toBe("/available");
    },
  );

  it("проигравшему предложению никуда идти не предлагает", () => {
    expect(offerHint(OfferStatus.NOT_ACCEPTED, ORDER_ID)?.link).toBeUndefined();
  });
});
