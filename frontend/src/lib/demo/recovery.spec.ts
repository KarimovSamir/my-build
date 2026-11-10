import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBDatabase, IDBFactory, IDBObjectStore, IDBOpenDBRequest } from "fake-indexeddb";
import { DemoRepository, DEMO_TRANSACTION_TIMEOUT_MS } from "./repository";
import { ObjectType, OrderCategory } from "@/lib/types";

const repos: DemoRepository[] = [];
const repo = (factory = new IDBFactory()) => { const r = new DemoRepository(factory, "recovery"); repos.push(r); return r; };
afterEach(async () => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); await Promise.all(repos.splice(0).map((r) => r.close())); });
const values = { title: "Проверка восстановления", description: "Создать заказ после ошибки записи", category: OrderCategory.PLAN_CREATION,
  objectType: ObjectType.HOUSE, squareMeters: "100", clientBudget: "", address: "Баку, тестовый адрес", desiredStartDate: "" };

describe("storage failure and recovery", () => {
  it("aborts a stalled transaction and permits a retry instead of waiting indefinitely", async () => {
    const r = repo(); const before = await r.read();
    vi.useFakeTimers();
    const abort = vi.fn();
    const tx = { objectStore: () => ({ get: () => ({}) }), abort };
    const spy = vi.spyOn(IDBDatabase.prototype, "transaction").mockReturnValueOnce(tx as unknown as IDBTransaction);
    const failure = expect(r.read()).rejects.toThrow("не отвечает");
    await vi.advanceTimersByTimeAsync(DEMO_TRANSACTION_TIMEOUT_MS);
    await failure;
    expect(abort).toHaveBeenCalledOnce();
    spy.mockRestore(); vi.useRealTimers();
    expect(await r.read()).toEqual(before);
  });
  it("does not report quota failure as success and recovers without resetting the saved world", async () => {
    const r = repo(); const before = await r.read();
    const command = { actorId: "anna", generation: before.generation, operationId: "retry", command: { kind: "createOrder" as const, id: "retry", values } };
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => { throw new DOMException("Full", "QuotaExceededError"); });
    await expect(r.execute(command)).rejects.toMatchObject({ name: "QuotaExceededError" });
    expect(await r.read()).toEqual(before);
    const saved = await r.execute(command);
    expect(saved.orders[0].id).toBe("retry");
    expect(saved.revision).toBe(before.revision + 1);
  });
  it("closes a connection arriving after blocked failure and permits a retry", async () => {
    const factory = new IDBFactory(); const request = new IDBOpenDBRequest();
    const open = vi.spyOn(factory, "open").mockReturnValueOnce(request);
    const r = repo(factory); const failed = expect(r.read()).rejects.toThrow("Закройте другие вкладки");
    request.onblocked?.call(request, new Event("blocked") as IDBVersionChangeEvent); await failed;
    const close = vi.fn();
    Object.defineProperty(request, "result", { value: { close } });
    request.onsuccess?.call(request, new Event("success"));
    expect(close).toHaveBeenCalledOnce();
    open.mockRestore();
    expect((await r.read()).orders).toHaveLength(6);
  });
  it("keeps malformed data unchanged until an explicit reset", async () => {
    const factory = new IDBFactory(); const r = repo(factory); const original = await r.read();
    await new Promise<void>((resolve, reject) => {
      const open = factory.open("recovery", 1);
      open.onsuccess = () => {
        const db = open.result; const tx = db.transaction("world", "readwrite");
        tx.objectStore("world").put({ ...original, users: null }, "current");
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
      };
    });
    await expect(r.read()).rejects.toThrow("повреждены");
    await expect(r.read()).rejects.toThrow("повреждены");
    const reset = await r.reset();
    expect(reset.generation).not.toBe(original.generation);
    expect(reset.orders).toHaveLength(6);
  });
});

describe("independent tab stores", () => {
  it("shares committed data, keeps roles separate and refreshes without losing local writes", async () => {
    vi.resetModules(); vi.stubGlobal("indexedDB", new IDBFactory());
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden"); }));
    const sessionA = new Map<string, string>(); const sessionB = new Map<string, string>();
    const session = (map: Map<string, string>) => vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => map.set(key, value), removeItem: (key: string) => map.delete(key),
    });
    session(sessionA); const a = await import("./store"); await a.initializeDemo(); a.chooseActor("anna");
    vi.resetModules(); session(sessionB); const b = await import("./store"); await b.initializeDemo(); b.chooseActor("stroygrad");
    session(sessionA); await a.executeDemo({ kind: "createOrder", id: "tab-order", values });
    expect(b.getDemoSnapshot().state?.orders.some((o) => o.id === "tab-order")).toBe(false);
    session(sessionB); await b.reloadDemo();
    expect(b.getDemoSnapshot().actorId).toBe("stroygrad");
    await b.executeDemo({ kind: "submitOffer", orderId: "tab-order", id: "tab-offer", values: {
      proposedPrice: "500", proposedDeadline: new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10), comment: "" } });
    session(sessionA); await a.reloadDemo();
    expect(a.getDemoSnapshot().actorId).toBe("anna");
    expect(a.getDemoSnapshot().state?.orders[0].offers[0].id).toBe("tab-offer");
    a.chooseActor(null);
    expect(a.getDemoSnapshot().state?.orders[0].id).toBe("tab-order");
    expect(b.getDemoSnapshot().actorId).toBe("stroygrad");
    expect(sessionA.has("mybuild-demo-actor")).toBe(false);
    expect(sessionB.get("mybuild-demo-actor")).toBe("stroygrad");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("restores the same saved world after a temporary read failure", async () => {
    vi.resetModules(); vi.stubGlobal("indexedDB", new IDBFactory());
    vi.stubGlobal("sessionStorage", { getItem: () => null });
    const store = await import("./store"); const { DemoRepository: Repository } = await import("./repository");
    await store.initializeDemo(); const before = store.getDemoSnapshot().state;
    vi.spyOn(Repository.prototype, "read").mockRejectedValueOnce(new Error("Temporary failure"));
    await store.reloadDemo(); expect(store.getDemoSnapshot().error).toBe("Temporary failure");
    expect(store.getDemoSnapshot().state).toBe(before);
    await store.reloadDemo(); expect(store.getDemoSnapshot().error).toBeNull();
    expect(store.getDemoSnapshot().state).toEqual(before);
  });
});
