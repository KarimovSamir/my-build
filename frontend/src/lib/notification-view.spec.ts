import { describe, expect, it } from "vitest";

import { NotificationType, type NotificationDto } from "@/lib/types";

import {
  MAX_BELL_COUNT,
  bellLabel,
  formatUnreadCount,
  notificationHref,
} from "./notification-view";

function notification(overrides: Partial<NotificationDto> = {}): NotificationDto {
  return {
    id: "n1",
    type: NotificationType.OFFER_RECEIVED,
    orderId: "order-1",
    title: "Новое предложение",
    body: "ORD-24 «Ремонт»: предложение от «СтройГрад»",
    isRead: false,
    createdAt: "2026-09-05T10:00:00.000Z",
    ...overrides,
  };
}

describe("notificationHref", () => {
  it("ведёт к заказу", () => {
    expect(notificationHref(notification())).toBe("/orders/order-1");
  });

  /**
   * Так приходит `ORDER_DELETED`: заказ удалён, внешний ключ обнулён
   * (`onDelete: SetNull`), и ссылка вела бы в 404.
   */
  it("у уведомления без заказа ссылки нет", () => {
    expect(
      notificationHref(
        notification({ type: NotificationType.ORDER_DELETED, orderId: null }),
      ),
    ).toBeNull();
  });
});

describe("formatUnreadCount", () => {
  it.each([
    [1, "1"],
    [7, "7"],
    [MAX_BELL_COUNT, String(MAX_BELL_COUNT)],
  ])("%i показывает как «%s»", (count, expected) => {
    expect(formatUnreadCount(count)).toBe(expected);
  });

  it("число за потолком показывает как «99+»", () => {
    expect(formatUnreadCount(MAX_BELL_COUNT + 1)).toBe(`${MAX_BELL_COUNT}+`);
    expect(formatUnreadCount(1204)).toBe(`${MAX_BELL_COUNT}+`);
  });

  /**
   * Ноль в кружке выглядел бы как уведомление, которого нет. Отрицательное
   * и нечисло сюда прийти не должны, но приходят из сети — значок от этого
   * не рисуется, а не показывает мусор.
   */
  it.each([
    ["ноль", 0],
    ["отрицательное", -3],
    ["NaN", Number.NaN],
    ["бесконечность", Number.POSITIVE_INFINITY],
  ])("%s значка не даёт", (_, count) => {
    expect(formatUnreadCount(count)).toBeNull();
  });
});

describe("bellLabel", () => {
  it("называет число непрочитанных", () => {
    expect(bellLabel(3)).toBe("Уведомления, непрочитанных: 3");
  });

  it("за потолком говорит то же, что показывает значок", () => {
    expect(bellLabel(250)).toBe(`Уведомления, непрочитанных: ${MAX_BELL_COUNT}+`);
  });

  it("без непрочитанных остаётся просто «Уведомления»", () => {
    expect(bellLabel(0)).toBe("Уведомления");
  });
});
