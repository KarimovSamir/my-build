import { describe, expect, it } from "vitest";

import { OrderStatus } from "@/lib/types";

import { showcasePoints } from "./auth-showcase";

describe("showcasePoints", () => {
  it("нумерует пункты подряд, начиная с первого", () => {
    expect(showcasePoints.map((point) => point.number)).toEqual(["01", "02", "03"]);
  });

  it("называет столько статусов, сколько их есть у заказа", () => {
    // Число записано в заголовке словом: новый статус обязан его поменять.
    expect(showcasePoints[0]?.title).toMatch(/^Шесть /);
    expect(Object.values(OrderStatus)).toHaveLength(6);
  });

  it("объясняет каждый пункт непустым текстом", () => {
    for (const point of showcasePoints) {
      expect(point.title.length).toBeGreaterThan(0);
      expect(point.text.length).toBeGreaterThan(0);
    }
  });
});
