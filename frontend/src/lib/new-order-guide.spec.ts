import { describe, expect, it } from "vitest";

import { OrderStatus, orderStatusLabels } from "@/lib/types";

import { newOrderSteps } from "./new-order-guide";

describe("newOrderSteps", () => {
  it("нумерует шаги подряд, начиная с первого", () => {
    expect(newOrderSteps.map((step) => step.number)).toEqual(["01", "02", "03"]);
  });

  it("называет первый статус так же, как его называет кабинет", () => {
    // Иначе подсказка обещала бы одно состояние, а список показывал другое.
    expect(newOrderSteps[0]?.text).toContain(orderStatusLabels[OrderStatus.WAITING]);
  });

  it("объясняет каждый шаг непустым текстом", () => {
    for (const step of newOrderSteps) {
      expect(step.text.length).toBeGreaterThan(0);
    }
  });
});
