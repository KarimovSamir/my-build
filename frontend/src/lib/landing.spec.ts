import { describe, expect, it } from "vitest";

import { OrderStatus, orderStatusLabels } from "@/lib/types";

import { dealRoute } from "./landing";

describe("dealRoute", () => {
  it("показывает все статусы заказа, каждый по одному разу", () => {
    const shown = dealRoute.map((step) => step.status);

    expect([...shown].sort()).toEqual(Object.values(OrderStatus).sort());
  });

  it("берёт названия шагов из shared, а не пишет свои", () => {
    for (const step of dealRoute) {
      expect(step.label).toBe(orderStatusLabels[step.status]);
    }
  });

  it("начинает поиском исполнителя и заканчивает завершённым заказом", () => {
    expect(dealRoute.at(0)?.status).toBe(OrderStatus.WAITING);
    expect(dealRoute.at(-1)?.status).toBe(OrderStatus.COMPLETED);
  });

  it("подсвечивает ровно один шаг", () => {
    expect(dealRoute.filter((step) => step.current)).toHaveLength(1);
  });

  it("объясняет каждый шаг непустым текстом", () => {
    for (const step of dealRoute) {
      expect(step.note.length).toBeGreaterThan(0);
    }
  });
});
