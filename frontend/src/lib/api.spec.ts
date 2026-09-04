import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Адрес API читается модулем один раз при загрузке — подменяем до импорта.
vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");

const { api, apiFetch, ApiRequestError } = await import("./api");

const fetchMock = vi.fn();

/** Что именно ушло в `fetch` при последнем вызове. */
function lastCall(): { url: string; init: RequestInit & { headers: Record<string, string> } } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];

  return { url, init: init as RequestInit & { headers: Record<string, string> } };
}

/** Новый ответ на каждый вызов: тело `Response` читается только один раз. */
function replyWith(body: unknown, status = 200): void {
  fetchMock.mockImplementation(
    () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("адрес запроса", () => {
  it("склеивается с адресом API без двойных косых", async () => {
    replyWith({});

    await api.get("/orders");
    expect(lastCall().url).toBe("http://api.test/orders");

    await api.get("orders");
    expect(lastCall().url).toBe("http://api.test/orders");
  });

  it("не отправляет пустые параметры строки запроса", async () => {
    replyWith({});

    await api.get("/orders", { query: { status: undefined, q: "", page: null } });

    expect(lastCall().url).toBe("http://api.test/orders");
  });

  it("отправляет числа и false", async () => {
    replyWith({});

    await api.get("/orders", { query: { page: 2, unread: false } });

    expect(lastCall().url).toBe("http://api.test/orders?page=2&unread=false");
  });

  it("кодирует значения параметров", async () => {
    replyWith({});

    await api.get("/orders", { query: { q: "ремонт кухни" } });

    expect(new URL(lastCall().url).searchParams.get("q")).toBe("ремонт кухни");
  });
});

describe("заголовки и тело", () => {
  it("объект уходит как JSON", async () => {
    replyWith({});

    await api.post("/offers", { price: "1000" });

    const { init } = lastCall();
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ price: "1000" }));
  });

  it("FormData уходит как есть, без Content-Type", async () => {
    // Заголовок должен проставить браузер: вместе с ним идёт boundary,
    // и подменённый вручную Content-Type ломает разбор multipart.
    replyWith({});
    const body = new FormData();
    body.set("title", "Ремонт");

    await api.post("/orders", body);

    const { init } = lastCall();
    expect(init.headers["Content-Type"]).toBeUndefined();
    expect(init.body).toBe(body);
  });

  it("запрос без тела уходит без Content-Type", async () => {
    replyWith({});

    await api.get("/orders");

    expect(lastCall().init.headers["Content-Type"]).toBeUndefined();
  });

  it("токен уходит заголовком Authorization", async () => {
    replyWith({});

    await api.get("/profile", { token: "jwt-token" });

    expect(lastCall().init.headers.Authorization).toBe("Bearer jwt-token");
  });

  it("без токена заголовка Authorization нет", async () => {
    replyWith({});

    await api.get("/health", { token: null });

    expect(lastCall().init.headers.Authorization).toBeUndefined();
  });
});

describe("ответ", () => {
  it("разбирает тело успешного ответа", async () => {
    replyWith({ id: "order-1" });

    await expect(api.get("/orders/order-1")).resolves.toEqual({ id: "order-1" });
  });

  it("на 204 не пытается разобрать тело", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(api.delete("/orders/order-1")).resolves.toBeUndefined();
  });
});

describe("ошибки", () => {
  it("бросает ApiRequestError с кодом и разобранным телом", async () => {
    replyWith({ statusCode: 403, message: "Доступ запрещён", error: "Forbidden" }, 403);

    const error = await api.get("/orders/чужой").catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as InstanceType<typeof ApiRequestError>).statusCode).toBe(403);
    expect((error as InstanceType<typeof ApiRequestError>).message).toBe("Доступ запрещён");
    expect((error as InstanceType<typeof ApiRequestError>).body?.error).toBe("Forbidden");
  });

  it("собирает сообщения валидации в список", async () => {
    replyWith({ statusCode: 400, message: ["Укажите название", "Укажите площадь"] }, 400);

    const error = (await apiFetch("/orders", { method: "POST" }).catch(
      (reason: unknown) => reason,
    )) as InstanceType<typeof ApiRequestError>;

    expect(error.validationMessages).toEqual(["Укажите название", "Укажите площадь"]);
    expect(error.message).toBe("Укажите название, Укажите площадь");
  });

  it("одиночное сообщение тоже отдаёт списком", async () => {
    replyWith({ statusCode: 409, message: "Заказ уже в работе" }, 409);

    const error = (await api.delete("/orders/order-1").catch(
      (reason: unknown) => reason,
    )) as InstanceType<typeof ApiRequestError>;

    expect(error.validationMessages).toEqual(["Заказ уже в работе"]);
  });

  it("не-JSON тело не роняет разбор", async () => {
    fetchMock.mockResolvedValue(new Response("<html>502</html>", { status: 502 }));

    const error = (await api.get("/orders").catch(
      (reason: unknown) => reason,
    )) as InstanceType<typeof ApiRequestError>;

    expect(error.statusCode).toBe(502);
    expect(error.body).toBeNull();
    expect(error.message).toBe("Запрос завершился с кодом 502");
    expect(error.validationMessages).toEqual([]);
  });
});
