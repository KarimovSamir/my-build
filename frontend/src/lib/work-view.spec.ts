import { describe, expect, it } from "vitest";

import { OrderStatus } from "@/lib/types";

import { workHint } from "./work-view";

describe("workHint", () => {
  it("до принятия предложения блока работы нет", () => {
    expect(workHint(OrderStatus.WAITING, false)).toBeNull();
    expect(workHint(OrderStatus.AWAITING_CONFIRMATION, false)).toBeNull();
  });

  it("в работе объясняет, что делать, и меняет текст после загрузки файлов", () => {
    const empty = workHint(OrderStatus.IN_PROGRESS, false);
    const ready = workHint(OrderStatus.IN_PROGRESS, true);

    expect(empty).toContain("Загрузите файлы");
    expect(ready).toContain("сдайте");
    expect(empty).not.toBe(ready);
  });

  it("на доработке зовёт загрузить исправленные файлы", () => {
    expect(workHint(OrderStatus.COMPLETION_DISPUTED, false)).toContain("доработку");
    expect(workHint(OrderStatus.COMPLETION_DISPUTED, true)).toContain("заново");
  });

  it("пока работа у клиента, объясняет, почему файлы не добавить", () => {
    const hint = workHint(OrderStatus.AWAITING_COMPLETION_CONFIRMATION, true);

    expect(hint).toContain("ждёт его решения");
  });

  it("на каждый статус есть текст", () => {
    for (const status of Object.values(OrderStatus)) {
      const hint = workHint(status, false);

      expect(hint === null || hint.length > 0).toBe(true);
    }
  });
});
