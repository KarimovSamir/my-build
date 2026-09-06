import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { socketEvents, type SocketEvent } from "@/lib/types";

import {
  BURST_DELAY_MS,
  COMPANY_FEED_EVENTS,
  COMPANY_OFFERS_EVENTS,
  ORDER_DETAIL_EVENTS,
  ORDERS_LIST_EVENTS,
  createBurst,
  eventOrderId,
} from "./live-updates";

describe("состав событий", () => {
  const pages: Record<string, readonly SocketEvent[]> = {
    "карточка заказа": ORDER_DETAIL_EVENTS,
    "заказы клиента": ORDERS_LIST_EVENTS,
    "мои предложения": COMPANY_OFFERS_EVENTS,
    "лента компании": COMPANY_FEED_EVENTS,
  };

  /**
   * Зеркало backend'ного теста «каждый тип уведомления кем-то создаётся»:
   * там проверяется, что событие есть кому породить, здесь — что его есть
   * кому услышать. Событие §8, которое никто не слушает, — это либо мёртвый
   * код на сервере, либо экран, который не обновляется.
   */
  it("каждое событие ТЗ §8 кто-то слушает", () => {
    const heard = new Set(Object.values(pages).flat());

    expect([...Object.values(socketEvents)].filter((event) => !heard.has(event))).toEqual(
      [],
    );
  });

  it.each(Object.entries(pages))("%s слушает только настоящие события", (_, events) => {
    const known = new Set<string>(Object.values(socketEvents));

    expect(events.filter((event) => !known.has(event))).toEqual([]);
  });

  it.each(Object.entries(pages))("%s не слушает одно событие дважды", (_, events) => {
    expect(new Set(events).size).toBe(events.length);
  });

  /**
   * Уведомление — следствие того же действия, о котором карточке уже сказало
   * событие про заказ. Слушать оба значило бы перечитывать её дважды.
   */
  it("карточка заказа не слушает уведомления", () => {
    expect(ORDER_DETAIL_EVENTS).not.toContain(socketEvents.notificationCreated);
  });
});

describe("eventOrderId", () => {
  it("достаёт заказ из нагрузки события", () => {
    expect(eventOrderId({ orderId: "order-1", offerId: "offer-1" })).toBe("order-1");
  });

  it.each([
    ["уведомление без заказа", { notification: { id: "n1" } }],
    ["пустая строка", { orderId: "" }],
    ["не строка", { orderId: 42 }],
    ["не объект", "order-1"],
    ["ничего", null],
    ["undefined", undefined],
  ])("%s заказа не даёт", (_, payload) => {
    expect(eventOrderId(payload)).toBeNull();
  });
});

describe("createBurst", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("не запускается раньше паузы", () => {
    const run = vi.fn();
    createBurst(run).schedule();

    vi.advanceTimersByTime(BURST_DELAY_MS - 1);

    expect(run).not.toHaveBeenCalled();
  });

  it("пачка событий даёт один запуск", () => {
    const run = vi.fn();
    const burst = createBurst(run);

    // Принятие предложения рождает сразу несколько событий: статус заказа,
    // статусы проигравших предложений и уведомления.
    burst.schedule();
    burst.schedule();
    burst.schedule();

    vi.advanceTimersByTime(BURST_DELAY_MS);

    expect(run).toHaveBeenCalledTimes(1);
  });

  /**
   * Таймер не продлевается новыми событиями: иначе плотный поток откладывал бы
   * обновление бесконечно, и страница не обновилась бы вовсе.
   */
  it("непрерывный поток событий не откладывает запуск", () => {
    const run = vi.fn();
    const burst = createBurst(run);

    for (let tick = 0; tick < 10; tick += 1) {
      burst.schedule();
      vi.advanceTimersByTime(BURST_DELAY_MS / 2);
    }

    expect(run).toHaveBeenCalled();
  });

  it("после запуска следующее событие планирует новый", () => {
    const run = vi.fn();
    const burst = createBurst(run);

    burst.schedule();
    vi.advanceTimersByTime(BURST_DELAY_MS);

    burst.schedule();
    vi.advanceTimersByTime(BURST_DELAY_MS);

    expect(run).toHaveBeenCalledTimes(2);
  });

  it("уход со страницы отменяет запланированное", () => {
    const run = vi.fn();
    const burst = createBurst(run);

    burst.schedule();
    burst.cancel();

    vi.advanceTimersByTime(BURST_DELAY_MS * 10);

    expect(run).not.toHaveBeenCalled();
  });

  it("отмена без запланированного ничего не ломает", () => {
    const burst = createBurst(vi.fn());

    expect(() => burst.cancel()).not.toThrow();
  });
});
