import { describe, expect, it } from "vitest";

import { completedOrdersText } from "./contractor-view";

describe("completedOrdersText", () => {
  it("склоняет «заказ» по числу", () => {
    expect(completedOrdersText(1)).toBe("1 завершённый заказ");
    expect(completedOrdersText(3)).toBe("3 завершённых заказа");
    expect(completedOrdersText(7)).toBe("7 завершённых заказов");
  });

  it("второй десяток идёт с «заказов», хотя оканчивается на 1–4", () => {
    expect(completedOrdersText(11)).toBe("11 завершённых заказов");
    expect(completedOrdersText(14)).toBe("14 завершённых заказов");
    expect(completedOrdersText(21)).toBe("21 завершённый заказ");
    expect(completedOrdersText(102)).toBe("102 завершённых заказа");
  });

  it("ноль объясняется словами, а не показателем «0»", () => {
    expect(completedOrdersText(0)).toBe("Пока нет завершённых заказов");
  });
});
