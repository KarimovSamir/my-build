import { describe, expect, it } from "vitest";

import { OrderStatus } from "@/lib/types";

import { completionHint } from "./completion-view";

const allStatuses = Object.values(OrderStatus);

describe("completionHint", () => {
  it("молчит, пока работа ни разу не сдавалась", () => {
    for (const status of [
      OrderStatus.WAITING,
      OrderStatus.AWAITING_CONFIRMATION,
      OrderStatus.IN_PROGRESS,
    ]) {
      expect(completionHint(status, true), status).toBeNull();
      expect(completionHint(status, false), status).toBeNull();
    }
  });

  it("на остальных статусах говорит обеим сторонам разное", () => {
    for (const status of [
      OrderStatus.AWAITING_COMPLETION_CONFIRMATION,
      OrderStatus.COMPLETION_DISPUTED,
      OrderStatus.COMPLETED,
    ]) {
      const owner = completionHint(status, true);
      const company = completionHint(status, false);

      expect(owner, status).toBeTruthy();
      expect(company, status).toBeTruthy();
      // Текст клиенту и текст исполнителю обязаны различаться: «подтвердите
      // выполнение» и «ждёт решения клиента» — про одно и то же событие,
      // но адресованы разным людям.
      expect(owner, status).not.toBe(company);
    }
  });

  it("покрывает все статусы заказа", () => {
    for (const status of allStatuses) {
      expect(() => completionHint(status, true)).not.toThrow();
    }
  });

  it("клиента зовёт решать только там, где решение возможно", () => {
    expect(completionHint(OrderStatus.AWAITING_COMPLETION_CONFIRMATION, true)).toContain(
      "подтвердите выполнение",
    );
    expect(completionHint(OrderStatus.COMPLETION_DISPUTED, true)).not.toContain(
      "подтвердите выполнение",
    );
  });
});
