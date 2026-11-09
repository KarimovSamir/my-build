import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { ObjectType, OrderCategory, OrderStatus, type OfferDto, type OrderDetail } from "@/lib/types";
import { toOrderFormData } from "@/lib/order-form";
import { toOfferBody } from "@/lib/offer-form";
import { acceptOfferBody } from "@/lib/offer-view";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("indexedDB", new IDBFactory());
  const session = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => session.get(key) ?? null,
    setItem: (key: string, value: string) => session.set(key, value),
    removeItem: (key: string) => session.delete(key),
  });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Demo must not fetch"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("form adapter and local store", () => {
  it("completes the forms' request flow, restores state and role after reload, and never fetches", async () => {
    const store = await import("./store");
    const { browserApi } = await import("../api.client");
    await store.initializeDemo();
    store.chooseActor("anna");
    const order = await browserApi.post<OrderDetail>("/orders", toOrderFormData({
      title: "Ремонт для проверки", description: "Заменить покрытие пола и покрасить стены",
      category: OrderCategory.PLAN_IMPLEMENTATION, objectType: ObjectType.APARTMENT,
      squareMeters: "70,5", address: "Тестовый адрес, 12", clientBudget: "5000,50", desiredStartDate: "",
    }, []));
    expect(order.squareMeters).toBe(70.5);
    expect(order.clientBudget).toBe("5000.50");
    store.chooseActor("stroygrad");
    const offer = await browserApi.post<OfferDto>("/offers", toOfferBody(order.id, {
      proposedPrice: "4000,25", proposedDeadline: new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10), comment: "Под ключ",
    }));
    store.chooseActor("anna");
    const accepted = await browserApi.post<OrderDetail>(`/orders/${order.id}/accept-offer/${offer.id}`, acceptOfferBody(offer));
    expect(accepted.status).toBe(OrderStatus.IN_PROGRESS);
    expect(accepted.price).toBe("4000.25");
    const before = store.getDemoSnapshot().state;
    await expect(browserApi.post(`/orders/${order.id}/accept-offer/${offer.id}`, acceptOfferBody(offer))).rejects.toThrow();
    expect(store.getDemoSnapshot().state).toEqual(before);

    // A fresh module instance simulates a reload; storage remains the same.
    vi.resetModules();
    const reopened = await import("./store");
    await reopened.initializeDemo();
    expect(reopened.getDemoSnapshot().actorId).toBe("anna");
    expect(reopened.getDemoSnapshot().state).toEqual(before);
    const generation = before!.generation;
    await reopened.resetDemo();
    expect(reopened.getDemoSnapshot().state!.generation).not.toBe(generation);
    expect(reopened.getDemoSnapshot().state!.orders).toHaveLength(6);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("recovers after unavailable storage and makes temporary mode explicit", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const store = await import("./store");
    await store.initializeDemo();
    expect(store.getDemoSnapshot().state).toBeNull();
    expect(store.getDemoSnapshot().error).toBeTruthy();
    store.continueInMemory();
    expect(store.getDemoSnapshot().mode).toBe("memory");
    expect(store.getDemoSnapshot().state!.orders).toHaveLength(6);
    await store.reloadDemo();
    expect(store.getDemoSnapshot().error).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps operating when session storage is blocked", async () => {
    vi.stubGlobal("sessionStorage", {
      getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() { throw new Error("denied"); },
    });
    const store = await import("./store");
    await store.initializeDemo();
    store.chooseActor("stroygrad");
    expect(store.getDemoSnapshot().actorId).toBe("stroygrad");
    expect(store.getDemoSnapshot().error).toBeNull();
  });
});

describe("stage 2 form adapter", () => {
  it("runs the existing file/work/profile/notification requests entirely locally", async () => {
    const store = await import("./store");
    const { browserApi } = await import("../api.client");
    const { toWorkFilesFormData } = await import("../work-form");
    const { toProfileBody, toProfileForm } = await import("../profile-form");
    await store.initializeDemo(); store.chooseActor("stroygrad");
    const target = "/orders/sample-3";
    const files = [new File(["%PDF-1.4\nlocal demo\n%%EOF"], "result.pdf", { type: "application/pdf" })];
    let order = await browserApi.post<OrderDetail>(`${target}/files`, toWorkFilesFormData({ files, comment: "Первый вариант" }));
    expect(order.files.filter((f) => f.ownerType === "COMPANY")).toHaveLength(1);
    const id = order.files.find((f) => f.ownerType === "COMPANY")!.id;
    const link = await browserApi.get<{ url: string }>(`/documents/${id}/download`);
    expect(link.url).toMatch(/^blob:/); URL.revokeObjectURL(link.url);
    order = await browserApi.patch<OrderDetail>(`${target}/verified-area`, { verifiedSquareMeters: 123.5 });
    expect(order.verifiedSquareMeters).toBe(123.5);
    order = await browserApi.post<OrderDetail>(`${target}/submit`);
    expect(order.status).toBe(OrderStatus.AWAITING_COMPLETION_CONFIRMATION);
    store.chooseActor("remontplus");
    await expect(browserApi.get(`/documents/${id}/download`)).rejects.toThrow("недоступен");
    store.chooseActor("anna");
    await browserApi.post(`${target}/dispute`, { correctionComment: "Добавьте размеры" });
    store.chooseActor("stroygrad");
    await browserApi.post(`${target}/files`, toWorkFilesFormData({ files, comment: "Размеры добавлены" }));
    await browserApi.post(`${target}/submit`);
    store.chooseActor("anna");
    order = await browserApi.post<OrderDetail>(`${target}/confirm`, { comment: "Готово" });
    expect(order.status).toBe(OrderStatus.COMPLETED);
    expect(order.submissions).toHaveLength(2);
    expect(order.clientCompletionComment).toBe("Готово");
    expect((await browserApi.get<{ count: number }>("/notifications/unread-count")).count).toBeGreaterThan(0);
    expect((await browserApi.post<{ marked: number }>("/notifications/read-all")).marked).toBeGreaterThan(0);
    expect(await browserApi.post("/notifications/read-all")).toEqual({ marked: 0 });
    const profile = store.getDemoSnapshot().state!.users[0];
    await browserApi.patch("/profile", toProfileBody({ ...toProfileForm(profile), firstName: "Новое имя" }, profile.role));
    expect(store.getDemoSnapshot().state!.orders.find((o) => o.id === "sample-3")?.client?.firstName).toBe("Новое имя");
    const sample = await browserApi.get<{ url: string }>("/documents/sample-task-sample-2/download");
    expect(sample.url).toBe("/demo/room-plan.dxf");
    await browserApi.delete("/documents/sample-task-sample-2");
    await expect(browserApi.get("/documents/sample-task-sample-2/download")).rejects.toThrow();
    await browserApi.delete("/orders/sample-2");
    await expect(browserApi.get("/orders/sample-2")).rejects.toThrow("отсутствует");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an upload if the profile changes while its bytes are being prepared", async () => {
    const store = await import("./store"); const { browserApi } = await import("../api.client");
    const { toWorkFilesFormData } = await import("../work-form");
    await store.initializeDemo(); store.chooseActor("stroygrad");
    const before = store.getDemoSnapshot().state;
    const file = new File(["%PDF-1.4\n%%EOF"], "test.pdf");
    const pending = browserApi.post("/orders/sample-3/files", toWorkFilesFormData({ files: [file], comment: "Файл" }));
    store.chooseActor("remontplus");
    await expect(pending).rejects.toThrow("изменились");
    expect(store.getDemoSnapshot().state).toEqual(before);
  });

  it("returns the actual read count when another tab already read the notifications", async () => {
    const store = await import("./store"); const { browserApi } = await import("../api.client");
    const { DemoRepository } = await import("./repository");
    await store.initializeDemo(); store.chooseActor("stroygrad");
    await browserApi.post("/offers", toOfferBody("sample-1", { proposedPrice: "200", proposedDeadline: new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10), comment: "" }));
    store.chooseActor("anna");
    const state = store.getDemoSnapshot().state!;
    const other = new DemoRepository();
    try {
      await other.execute({ generation: state.generation, actorId: "anna", operationId: crypto.randomUUID(), command: { kind: "readNotifications" } });
      expect(await browserApi.post("/notifications/read-all")).toEqual({ marked: 0 });
    } finally { await other.close(); }
  });
});

describe("stale forms and recovery races", () => {
  it("rejects a form opened before an offer changed even after the store refreshed", async () => {
    const store = await import("./store"); const { browserApi } = await import("../api.client");
    await store.initializeDemo(); store.chooseActor("stroygrad");
    const body = toOfferBody("sample-1", { proposedPrice: "100", proposedDeadline: new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10), comment: "" });
    const original = await browserApi.post<OfferDto>("/offers", body);
    const edited = await browserApi.post<OfferDto>("/offers", { ...body, proposedPrice: "200", seenUpdatedAt: original.updatedAt });
    await expect(browserApi.post("/offers", { ...body, proposedPrice: "300", seenUpdatedAt: original.updatedAt })).rejects.toThrow("изменилось");
    expect(store.getDemoSnapshot().state!.orders[0].offers[0]).toEqual(edited);
  });
  it("does not replace temporary data with a late persistent read", async () => {
    const store = await import("./store"); const { DemoRepository } = await import("./repository");
    await store.initializeDemo();
    const original = store.getDemoSnapshot().state!;
    let resolve!: (state: typeof original) => void;
    const spy = vi.spyOn(DemoRepository.prototype, "read").mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const reload = store.reloadDemo();
    store.continueInMemory(); const temporary = store.getDemoSnapshot().state;
    resolve(original); await reload;
    expect(store.getDemoSnapshot().state).toBe(temporary);
    expect(store.getDemoSnapshot().mode).toBe("memory");
    spy.mockRestore();
  });
});
