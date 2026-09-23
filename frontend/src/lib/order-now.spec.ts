import { describe, expect, it } from "vitest";

import { OrderStatus, orderStatusLabels } from "@/lib/types";

import { resolveOrderNow } from "./order-now";

const allStatuses = Object.values(OrderStatus);

const CLIENT = { isOwner: true, isExecutor: false };
const EXECUTOR = { isOwner: false, isExecutor: true };
const BIDDER = { isOwner: false, isExecutor: false };

describe("resolveOrderNow", () => {
  it("заголовок совпадает с названием статуса на badge", () => {
    for (const status of allStatuses) {
      expect(resolveOrderNow(status, CLIENT).title, status).toBe(
        orderStatusLabels[status],
      );
    }
  });

  it("на каждом статусе есть текст для всех трёх зрителей", () => {
    for (const status of allStatuses) {
      for (const viewer of [CLIENT, EXECUTOR, BIDDER]) {
        expect(resolveOrderNow(status, viewer).text, status).toBeTruthy();
      }
    }
  });

  it("клиенту и исполнителю говорит разное", () => {
    for (const status of allStatuses) {
      expect(resolveOrderNow(status, CLIENT).text, status).not.toBe(
        resolveOrderNow(status, EXECUTOR).text,
      );
    }
  });

  it("решать зовёт ту сторону, за которой решение", () => {
    // Сдачу подтверждает клиент, а не исполнитель (ТЗ §4).
    expect(
      resolveOrderNow(OrderStatus.AWAITING_COMPLETION_CONFIRMATION, CLIENT).text,
    ).toContain("решение за вами");
    expect(
      resolveOrderNow(OrderStatus.AWAITING_COMPLETION_CONFIRMATION, EXECUTOR).text,
    ).not.toContain("решение за вами");

    // Исполнителя выбирает клиент.
    expect(resolveOrderNow(OrderStatus.AWAITING_CONFIRMATION, CLIENT).text).toContain(
      "не выбрали исполнителя",
    );
  });

  it("компании с предложением и исполнителю в ожидании выбора говорит разное", () => {
    // До принятия у компании ещё нет заказа, поэтому «ваше предложение
    // принимается» ей писать нельзя.
    expect(
      resolveOrderNow(OrderStatus.AWAITING_CONFIRMATION, BIDDER).text,
    ).not.toBe(resolveOrderNow(OrderStatus.AWAITING_CONFIRMATION, EXECUTOR).text);
  });
});
