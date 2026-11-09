import { describe, it, expect, afterEach, vi } from "vitest";
import { IDBFactory, IDBObjectStore, IDBOpenDBRequest } from "fake-indexeddb";
import { DemoRepository } from "./repository";
import { applyCommand, orderForViewer, type CommandEnvelope } from "./operations";
import { assertDemoState, createDemoState } from "./model";
import { ObjectType, OrderCategory, OrderStatus, OfferStatus } from "@/lib/types";

const repositories: DemoRepository[] = [];
afterEach(async () => { await Promise.all(repositories.splice(0).map((repo) => repo.close())); });
function repository(factory = new IDBFactory(), name = "test") {
  const repo = new DemoRepository(factory, name); repositories.push(repo); return repo;
}
const tomorrow = () => new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10);
const orderValues = { title: "Проверочный ремонт", description: "Выполнить ремонт двух комнат и коридора", category: OrderCategory.PLAN_IMPLEMENTATION,
  objectType: ObjectType.APARTMENT, address: "Баку, улица Тестовая, 12", squareMeters: "80", clientBudget: "4000", desiredStartDate: "" };
function envelope(generation: string, command: CommandEnvelope["command"], actorId = "anna"): CommandEnvelope {
  return { generation, command, actorId, operationId: crypto.randomUUID() };
}

describe("autonomous repository", () => {
  it("rejects a transaction aborted after put succeeds and leaves the saved world unchanged", async () => {
    const repo = repository(); const before = await repo.read();
    const put = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(function (this: IDBObjectStore, ...args) {
      const request = put.apply(this, args);
      request.addEventListener("success", () => this.transaction.abort());
      return request;
    });
    try {
      await expect(repo.execute(envelope(before.generation, { kind: "createOrder", id: "aborted", values: orderValues }))).rejects.toThrow();
      expect(await repo.read()).toEqual(before);
    } finally { spy.mockRestore(); }
  });

  it("stops waiting for an unresponsive storage open", async () => {
    vi.useFakeTimers();
    const factory = new IDBFactory();
    const spy = vi.spyOn(factory, "open").mockReturnValue(new IDBOpenDBRequest());
    const repo = repository(factory);
    try {
      const failure = expect(repo.read()).rejects.toThrow("не отвечает");
      await vi.advanceTimersByTimeAsync(8000);
      await failure;
    } finally { spy.mockRestore(); vi.useRealTimers(); }
  });

  it("initializes once even across simultaneous connections and survives reopening", async () => {
    const factory = new IDBFactory(); const a = repository(factory); const b = repository(factory);
    const [one, two] = await Promise.all([a.read(), b.read()]);
    expect(one.generation).toBe(two.generation);
    const create = envelope(one.generation, { kind: "createOrder", id: "new", values: orderValues });
    await a.execute(create); await a.close();
    expect((await b.read()).orders[0].id).toBe("new");
    expect((await b.read()).orders).toHaveLength(7);
  });

  it("serializes two companies, accepts one, rejects rivals and commits notifications together", async () => {
    const factory = new IDBFactory(); const a = repository(factory); const b = repository(factory);
    const initial = await a.read();
    const offer = (id: string) => ({ kind: "submitOffer" as const, id, orderId: "sample-1", values: { proposedPrice: "1234.50", proposedDeadline: tomorrow(), comment: "Все материалы включены" } });
    await Promise.all([a.execute(envelope(initial.generation, offer("a"), "stroygrad")), b.execute(envelope(initial.generation, offer("b"), "remontplus"))]);
    const next = await a.execute(envelope(initial.generation, { kind: "acceptOffer", orderId: "sample-1", offerId: "a", seenEditedAt: null }));
    expect(next.orders[0].status).toBe(OrderStatus.IN_PROGRESS);
    expect(next.orders[0].price).toBe("1234.50");
    expect(next.orders[0].offers.map((o) => o.status).sort()).toEqual([OfferStatus.ACCEPTED, OfferStatus.NOT_ACCEPTED].sort());
    expect(next.notifications.filter((n) => n.userId === "stroygrad")).toHaveLength(1);
    expect(next.notifications.filter((n) => n.userId === "remontplus")).toHaveLength(1);
    const before = await b.read();
    await expect(b.execute(envelope(initial.generation, { kind: "acceptOffer", orderId: "sample-1", offerId: "b", seenEditedAt: null }))).rejects.toThrow();
    expect(await b.read()).toEqual(before);
  });

  it("makes a repeated command idempotent and updates the one offer per company", async () => {
    const repo = repository(); const state = await repo.read();
    const request = envelope(state.generation, { kind: "createOrder", id: "new", values: orderValues });
    const once = await repo.execute(request); expect(await repo.execute(request)).toEqual(once);
    const command = { kind: "submitOffer" as const, id: "offer", orderId: "new", values: { proposedPrice: "100", proposedDeadline: tomorrow(), comment: "" } };
    await repo.execute(envelope(state.generation, command, "stroygrad"));
    const updated = await repo.execute(envelope(state.generation, { ...command, id: "other", values: { ...command.values, proposedPrice: "200" } }, "stroygrad"));
    const offers = updated.orders.find((o) => o.id === "new")!.offers;
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ id: "offer", proposedPrice: "200" });
    expect(offers[0].editedAt).not.toBeNull();
  });

  it("rolls back invalid commands and rejects actions by the wrong role", async () => {
    const repo = repository(); const state = await repo.read();
    await expect(repo.execute(envelope(state.generation, { kind: "createOrder", id: "x", values: orderValues }, "stroygrad"))).rejects.toThrow();
    await expect(repo.execute(envelope(state.generation, { kind: "createOrder", id: "x", values: { ...orderValues, squareMeters: "-1" } }))).rejects.toThrow();
    expect(await repo.read()).toEqual(state);
  });

  it("cannot mutate a new world using a stale tab after reset", async () => {
    const repo = repository(); const old = await repo.read(); const fresh = await repo.reset();
    expect(fresh.generation).not.toBe(old.generation);
    await expect(repo.execute(envelope(old.generation, { kind: "createOrder", id: "x", values: orderValues }))).rejects.toThrow("сброшено");
    expect(await repo.read()).toEqual(fresh);
  });

  it("keeps independent visitors isolated", async () => {
    const a = repository(); const b = repository(); const state = await a.read();
    await a.execute(envelope(state.generation, { kind: "createOrder", id: "x", values: orderValues }));
    expect((await b.read()).orders).toHaveLength(6);
  });

  it("does not overwrite incompatible persisted data and permits explicit reset", async () => {
    const factory = new IDBFactory(); const repo = repository(factory); await repo.read();
    await new Promise<void>((resolve, reject) => {
      const request = factory.open("test", 1);
      request.onsuccess = () => {
        const db = request.result; const tx = db.transaction("world", "readwrite");
        tx.objectStore("world").put({ version: 999 }, "current");
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
    });
    await expect(repo.read()).rejects.toThrow("Версия");
    await expect(repo.read()).rejects.toThrow("Версия");
    expect((await repo.reset()).orders).toHaveLength(6);
  });
});

describe("local workflow", () => {
  it("rejects damaged persisted contact data before rendering", () => {
    const state = createDemoState();
    state.orders[0].client = null;
    expect(() => assertDemoState(state)).toThrow("повреждены");
  });

  it("uses shared expiry and seen-offer checks without changing the original", () => {
    const initial = createDemoState();
    const state = applyCommand(initial, envelope(initial.generation, { kind: "submitOffer", id: "offer", orderId: "sample-1",
      values: { proposedPrice: "100", proposedDeadline: tomorrow(), comment: "" } }, "stroygrad"));
    const accept = envelope(state.generation, { kind: "acceptOffer", orderId: "sample-1", offerId: "offer", seenEditedAt: "old" });
    expect(() => applyCommand(state, accept)).toThrow("изменила");
    accept.command = { ...accept.command, seenEditedAt: null } as typeof accept.command;
    expect(() => applyCommand(state, accept, new Date(Date.now() + 86400000 * 20))).toThrow("сроком");
    expect(state.orders[0].status).toBe(OrderStatus.AWAITING_CONFIRMATION);
    expect(initial.orders[0].offers).toHaveLength(0);
  });

  it("does not display other companies' offers or private deal data", () => {
    let state = createDemoState();
    state = applyCommand(state, envelope(state.generation, { kind: "submitOffer", id: "offer", orderId: "sample-1",
      values: { proposedPrice: "100", proposedDeadline: tomorrow(), comment: "" } }, "stroygrad"));
    state = applyCommand(state, envelope(state.generation, { kind: "acceptOffer", orderId: "sample-1", offerId: "offer", seenEditedAt: null }));
    const hidden = orderForViewer(state.orders[0], "remontplus");
    expect(hidden.offers).toEqual([]); expect(hidden.client).toBeNull(); expect(hidden.price).toBeNull();
    expect(hidden.status).toBe(OrderStatus.WAITING); expect(hidden.canSubmitOffer).toBe(false);
    expect(orderForViewer(state.orders[0], "stroygrad").price).toBe("100");
  });
});
