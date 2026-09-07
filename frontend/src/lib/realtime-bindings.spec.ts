import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SubscribeAck } from "@/lib/types";

import { BURST_DELAY_MS } from "./live-updates";
import {
  bindConnection,
  bindRefresh,
  bindRoom,
  createConnectionStore,
  OFFLINE_NOTICE_DELAY_MS,
  ROOM_RETRY_DELAYS_MS,
  type SocketLike,
} from "./realtime-bindings";

/**
 * Подписки на сокет. Ломается это место молча — сокет жив, событий нет, —
 * поэтому проверяется каждое свойство, на которое опирается интерфейс.
 */

type Listener = (payload?: unknown) => void;

/** Сокет в том объёме, в каком его трогают подписки, плюс управление извне. */
function createSocket(connected = true) {
  const listeners = new Map<string, Set<Listener>>();
  const sent: { event: string; args: unknown[] }[] = [];

  /** Чем ответить на подписку. По умолчанию — пускаем. */
  let ack: SubscribeAck | undefined = { ok: true };

  const socket = {
    connected,
    on(event: string, listener: Listener) {
      const set = listeners.get(event) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(event, set);
    },
    off(event: string, listener: Listener) {
      listeners.get(event)?.delete(listener);
    },
    emit(event: string, ...args: unknown[]) {
      sent.push({ event, args });

      const callback = args.at(-1);
      if (typeof callback === "function") (callback as (ack?: SubscribeAck) => void)(ack);
    },
  };

  return {
    socket: socket as SocketLike,
    sent,
    /** Сколько слушателей висит на событии — для проверки уборки. */
    count: (event: string) => listeners.get(event)?.size ?? 0,
    /** Прислать событие с сервера. */
    fire(event: string, payload?: unknown) {
      for (const listener of [...(listeners.get(event) ?? [])]) listener(payload);
    },
    /** Что ответит шлюз на следующие подписки. */
    answer(next: SubscribeAck | undefined) {
      ack = next;
    },
    setConnected(value: boolean) {
      socket.connected = value;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("bindRefresh", () => {
  it("перечитывает данные по событию, но один раз на пачку", () => {
    const refresh = vi.fn();
    const { socket, fire } = createSocket();

    bindRefresh(socket, { events: ["order:status_changed", "offer:created"], refresh });

    // Одно действие рождает несколько событий: принятие предложения шлёт
    // и статус заказа, и статусы проигравших.
    fire("order:status_changed", { orderId: "a" });
    fire("offer:created", { orderId: "a" });

    expect(refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(BURST_DELAY_MS);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("пропускает мимо чужие события", () => {
    const refresh = vi.fn();
    const { socket, fire } = createSocket();

    bindRefresh(socket, {
      events: ["order:status_changed"],
      refresh,
      // В личную комнату приходят события по всем заказам пользователя.
      accepts: (payload) => (payload as { orderId?: string }).orderId === "мой",
    });

    fire("order:status_changed", { orderId: "чужой" });
    vi.advanceTimersByTime(BURST_DELAY_MS);
    expect(refresh).not.toHaveBeenCalled();

    fire("order:status_changed", { orderId: "мой" });
    vi.advanceTimersByTime(BURST_DELAY_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("после обрыва перечитывает данные, а не только ждёт событий", () => {
    const refresh = vi.fn();
    const { socket, fire } = createSocket();

    bindRefresh(socket, { events: ["order:status_changed"], refresh });

    fire("disconnect");
    fire("connect");
    vi.advanceTimersByTime(BURST_DELAY_MS);

    // socket.io ничего не буферизует: без этого перечита всё, что случилось
    // за время обрыва, до вкладки не доедет никогда.
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("на первое подключение ничего не перечитывает", () => {
    const refresh = vi.fn();
    const { socket, fire } = createSocket();

    bindRefresh(socket, { events: ["order:status_changed"], refresh });

    fire("connect");
    vi.advanceTimersByTime(BURST_DELAY_MS);

    // Страница только что отрисована сервером — запрос был бы лишним
    // на каждой загрузке кабинета.
    expect(refresh).not.toHaveBeenCalled();
  });

  it("уборка снимает всех слушателей и отменяет запланированное", () => {
    const refresh = vi.fn();
    const { socket, fire, count } = createSocket();

    const unbind = bindRefresh(socket, { events: ["order:status_changed"], refresh });

    fire("order:status_changed", {});
    unbind();
    vi.advanceTimersByTime(BURST_DELAY_MS);

    expect(refresh).not.toHaveBeenCalled();
    expect(count("order:status_changed")).toBe(0);
    expect(count("connect")).toBe(0);
    expect(count("disconnect")).toBe(0);
  });
});

describe("bindRoom", () => {
  it("входит в комнату сразу, если сокет уже подключён", () => {
    const { socket, sent } = createSocket();

    bindRoom(socket, {
      subscribe: "subscribe:order",
      unsubscribe: "unsubscribe:order",
      payload: { orderId: "42" },
    });

    expect(sent[0]).toMatchObject({ event: "subscribe:order" });
    expect(sent[0]?.args[0]).toEqual({ orderId: "42" });
  });

  it("входит в комнату заново после переподключения", () => {
    const { socket, sent, fire } = createSocket();

    bindRoom(socket, {
      subscribe: "subscribe:feed",
      unsubscribe: "unsubscribe:feed",
      payload: {},
    });

    fire("connect");

    // Комнаты живут на сервере и обрыв не переживают: переподключившийся
    // сокет — новый участник, о котором сервер ничего не помнит.
    expect(sent.filter((message) => message.event === "subscribe:feed")).toHaveLength(2);
  });

  it("повторяет попытку при устранимом отказе", () => {
    const warn = vi.fn();
    const { socket, sent, answer } = createSocket();

    answer({ ok: false, error: "Не удалось подписаться на обновления", retryable: true });

    bindRoom(socket, {
      subscribe: "subscribe:order",
      unsubscribe: "unsubscribe:order",
      payload: { orderId: "42" },
      onWarn: warn,
    });

    expect(sent).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);

    answer({ ok: true });
    vi.advanceTimersByTime(ROOM_RETRY_DELAYS_MS[0]!);

    expect(sent).toHaveLength(2);
  });

  it("отказ по правам не повторяет", () => {
    const { socket, sent, answer } = createSocket();

    answer({ ok: false, error: "Заказ не найден" });

    bindRoom(socket, {
      subscribe: "subscribe:order",
      unsubscribe: "unsubscribe:order",
      payload: { orderId: "42" },
      onWarn: () => undefined,
    });

    vi.advanceTimersByTime(60_000);

    // Правило от повтора не изменится — стучаться в чужой заказ бессмысленно.
    expect(sent).toHaveLength(1);
  });

  it("повторы не бесконечны", () => {
    const { socket, sent, answer } = createSocket();

    answer({ ok: false, retryable: true });

    bindRoom(socket, {
      subscribe: "subscribe:order",
      unsubscribe: "unsubscribe:order",
      payload: { orderId: "42" },
      onWarn: () => undefined,
    });

    vi.advanceTimersByTime(60_000);

    expect(sent).toHaveLength(1 + ROOM_RETRY_DELAYS_MS.length);
  });

  it("уборка выводит из комнаты и отменяет незапущенный повтор", () => {
    const { socket, sent, answer, count } = createSocket();

    answer({ ok: false, retryable: true });

    const unbind = bindRoom(socket, {
      subscribe: "subscribe:order",
      unsubscribe: "unsubscribe:order",
      payload: { orderId: "42" },
      onWarn: () => undefined,
    });

    answer({ ok: true });
    unbind();
    vi.advanceTimersByTime(60_000);

    expect(sent.map((message) => message.event)).toEqual([
      "subscribe:order",
      "unsubscribe:order",
    ]);
    expect(count("connect")).toBe(0);
  });

  it("у оборванного сокета не отписывается", () => {
    const { socket, sent, setConnected } = createSocket();

    const unbind = bindRoom(socket, {
      subscribe: "subscribe:feed",
      unsubscribe: "unsubscribe:feed",
      payload: {},
    });

    setConnected(false);
    unbind();

    // Оборванный сокет уже выпал из всех комнат, а сообщение легло бы
    // в очередь до переподключения.
    expect(sent.map((message) => message.event)).toEqual(["subscribe:feed"]);
  });

  it("до подключения в комнату не просится", () => {
    const { socket, sent } = createSocket(false);

    bindRoom(socket, {
      subscribe: "subscribe:feed",
      unsubscribe: "unsubscribe:feed",
      payload: {},
    });

    expect(sent).toHaveLength(0);
  });
});

describe("bindConnection", () => {
  it("о коротком разрыве не сообщает", () => {
    const changed = vi.fn();
    const { socket, fire } = createSocket();

    bindConnection(socket, changed);

    fire("disconnect");
    vi.advanceTimersByTime(OFFLINE_NOTICE_DELAY_MS - 1);
    fire("connect");

    // Переподключение после смены сети или обновления токена занимает доли
    // секунды: мигающая надпись пугала бы там, где ничего не сломалось.
    expect(changed.mock.calls).toEqual([[true]]);
  });

  it("о затянувшемся разрыве сообщает", () => {
    const changed = vi.fn();
    const { socket, fire } = createSocket();

    bindConnection(socket, changed);

    fire("disconnect");
    vi.advanceTimersByTime(OFFLINE_NOTICE_DELAY_MS);

    expect(changed).toHaveBeenCalledWith(false);

    fire("connect");
    expect(changed).toHaveBeenLastCalledWith(true);
  });

  it("несостоявшееся рукопожатие считает разрывом", () => {
    const changed = vi.fn();
    const { socket } = createSocket(false);

    bindConnection(socket, changed);
    vi.advanceTimersByTime(OFFLINE_NOTICE_DELAY_MS);

    // Событий о том, что backend недоступен, не приходит вовсе: сокет просто
    // никогда не подключается.
    expect(changed).toHaveBeenCalledWith(false);
  });

  it("уборка снимает слушателей и отменяет отсчёт", () => {
    const changed = vi.fn();
    const { socket, fire, count } = createSocket();

    const unbind = bindConnection(socket, changed);

    fire("disconnect");
    unbind();
    vi.advanceTimersByTime(OFFLINE_NOTICE_DELAY_MS);

    expect(changed).not.toHaveBeenCalled();
    expect(count("connect")).toBe(0);
    expect(count("disconnect")).toBe(0);
  });
});

describe("createConnectionStore", () => {
  it("до первого разрыва считает, что связь есть", () => {
    const { socket } = createSocket();
    const store = createConnectionStore(socket);

    // Иначе каждая загрузка кабинета начиналась бы с надписи о потерянной
    // связи, которая через мгновение пропадает.
    expect(store.getSnapshot()).toBe(true);
  });

  it("сообщает об изменении и меняет снимок", () => {
    const notify = vi.fn();
    const { socket, fire } = createSocket();
    const store = createConnectionStore(socket);

    store.subscribe(notify);

    fire("disconnect");
    vi.advanceTimersByTime(OFFLINE_NOTICE_DELAY_MS);

    expect(store.getSnapshot()).toBe(false);
    expect(notify).toHaveBeenCalledTimes(1);

    fire("connect");

    expect(store.getSnapshot()).toBe(true);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("повторное то же состояние перерисовки не вызывает", () => {
    const notify = vi.fn();
    const { socket, fire } = createSocket();
    const store = createConnectionStore(socket);

    store.subscribe(notify);
    fire("connect");
    fire("connect");

    expect(notify).not.toHaveBeenCalled();
  });

  it("на сервере сокета нет — связь считается живой", () => {
    const store = createConnectionStore(null);
    const unbind = store.subscribe(vi.fn());

    expect(store.getSnapshot()).toBe(true);
    expect(unbind).not.toThrow();
  });
});
