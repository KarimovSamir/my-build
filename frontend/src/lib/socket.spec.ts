import { afterEach, describe, expect, it, vi } from "vitest";

// Параметры объявлены типом мока, а не аргументами: без них `mock.calls`
// получает тип `[]`, и `calls[0][1]` перестаёт существовать для `tsc`.
const { io, getAccessToken } = vi.hoisted(() => ({
  io: vi.fn<(url: string, options: unknown) => { id: string }>(() => ({ id: "socket" })),
  getAccessToken: vi.fn(async () => "token-from-session"),
}));

vi.mock("socket.io-client", () => ({ io }));

// Путь тот же, каким его пишет `socket.ts`: через алиас `@/` это другой
// идентификатор модуля, и мок мог бы не примениться.
vi.mock("@/lib/api.client", () => ({ getAccessToken }));

import { WS_NAMESPACE } from "@/lib/types";

import { browserSocket, createAppSocket, WS_URL } from "./socket";

/** Опции, с которыми был создан сокет. */
function optionsOfLastCall(): { autoConnect?: boolean; auth?: unknown } {
  const call = io.mock.calls.at(-1);

  if (!call) throw new Error("io() не вызывался");

  return call[1] as { autoConnect?: boolean; auth?: unknown };
}

/** Дёрнуть колбэк `auth` так же, как это делает socket.io перед подключением. */
async function askForAuth(): Promise<{ token: string }> {
  const auth = optionsOfLastCall().auth as (
    send: (data: { token: string }) => void,
  ) => void;

  return new Promise((resolve) => auth(resolve));
}

afterEach(() => {
  io.mockClear();
  getAccessToken.mockClear();
});

describe("createAppSocket", () => {
  it("подключается к namespace шлюза", () => {
    createAppSocket(async () => "t");

    expect(io.mock.calls.at(-1)?.[0]).toBe(`${WS_URL}${WS_NAMESPACE}`);
  });

  it("сам не подключается: этим распоряжается провайдер", () => {
    createAppSocket(async () => "t");

    expect(optionsOfLastCall().autoConnect).toBe(false);
  });

  /**
   * Главное свойство: токен спрашивается перед **каждой** попыткой, а не
   * запоминается при создании. Иначе проснувшаяся через час вкладка
   * переподключалась бы с протухшим токеном и получала отказ навсегда.
   */
  it("токен спрашивается заново перед каждой попыткой", async () => {
    const tokens = ["first", "second"];
    createAppSocket(async () => tokens.shift() ?? null);

    await expect(askForAuth()).resolves.toEqual({ token: "first" });
    await expect(askForAuth()).resolves.toEqual({ token: "second" });
  });

  it("без сессии уходит пустой токен — отказывает сервер", async () => {
    createAppSocket(async () => null);

    await expect(askForAuth()).resolves.toEqual({ token: "" });
  });

  it("упавший запрос токена не оставляет подключение висеть", async () => {
    createAppSocket(async () => {
      throw new Error("сессия недоступна");
    });

    await expect(askForAuth()).resolves.toEqual({ token: "" });
  });
});

describe("browserSocket", () => {
  it("на сервере сокета нет", () => {
    expect(browserSocket()).toBeNull();
    expect(io).not.toHaveBeenCalled();
  });

  it("в браузере сокет один на вкладку и берёт токен из сессии", async () => {
    vi.stubGlobal("window", {});

    try {
      const first = browserSocket();

      expect(first).not.toBeNull();
      // Второе обращение отдаёт тот же объект: рукопожатие с проверкой JWKS
      // стоит дорого, и делать его на каждый переход между страницами нельзя.
      expect(browserSocket()).toBe(first);
      expect(io).toHaveBeenCalledTimes(1);

      await expect(askForAuth()).resolves.toEqual({ token: "token-from-session" });
      expect(getAccessToken).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
