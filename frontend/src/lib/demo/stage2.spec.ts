import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { readFileSync } from "node:fs";
import { createDemoState, assertDemoState } from "./model";
import { orderForViewer, canDeleteDemoFile, type DemoCommand } from "./operations";
import { DemoRepository } from "./repository";
import { prepareFiles, DEMO_FILE_BYTES, DEMO_TOTAL_BYTES } from "./files";
import { selectAvailable, selectDocuments, selectNotifications, selectOffers, selectOrders, contractors, paginate } from "./selectors";
import { FileOwnerType, NotificationType, ObjectType, OrderCategory, OrderStatus } from "@/lib/types";
import { toProfileForm } from "@/lib/profile-form";

const repos: DemoRepository[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(repos.splice(0).map((r) => r.close())); });
function repository(factory = new IDBFactory()) { const repo = new DemoRepository(factory, "stage2"); repos.push(repo); return repo; }
const offerValues = () => ({ proposedPrice: "2000", proposedDeadline: new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10), comment: "Материалы включены" });
const file = (name = "plan.pdf", suffix = "test") => new File([`%PDF-1.4\n${suffix}\n%%EOF`], name, { type: "application/pdf" });
const env = (generation: string, command: DemoCommand, actorId = "anna") => ({ generation, command, actorId, operationId: crypto.randomUUID() });
const orderValues = { title: "Новый проект", description: "Ремонт помещения и новая планировка", category: OrderCategory.PLAN_CREATION,
  objectType: ObjectType.APARTMENT, squareMeters: "100", clientBudget: "3000", address: "Баку, тестовый адрес", desiredStartDate: "" };

async function accepted(repo: DemoRepository) {
  const state = await repo.read();
  const run = (command: DemoCommand, actor = "anna") => repo.execute(env(state.generation, command, actor));
  await run({ kind: "submitOffer", orderId: "sample-1", id: "a", values: offerValues() }, "stroygrad");
  await run({ kind: "submitOffer", orderId: "sample-1", id: "b", values: offerValues() }, "remontplus");
  await run({ kind: "acceptOffer", orderId: "sample-1", offerId: "a", seenEditedAt: null });
  return run;
}

describe("complete local workflow", () => {
  it("preserves two rounds, bytes, completion and counters after reopening; hides everything from the rival", async () => {
    const factory = new IDBFactory(); const repo = repository(factory); const run = await accepted(repo);
    await expect(run({ kind: "submitWork", orderId: "sample-1" }, "stroygrad")).rejects.toThrow("файлы");
    const files = await prepareFiles([file()]);
    await run({ kind: "uploadFiles", orderId: "sample-1", files, comment: "Первый вариант", seenRound: 1 }, "stroygrad");
    await run({ kind: "verifyArea", orderId: "sample-1", value: "101,25" }, "stroygrad");
    await run({ kind: "submitWork", orderId: "sample-1", seenRound: 1 }, "stroygrad");
    await expect(run({ kind: "deleteFile", orderId: "sample-1", fileId: files[0].id }, "stroygrad")).rejects.toThrow();
    await expect(run({ kind: "uploadFiles", orderId: "sample-1", files, comment: "Поздно" }, "stroygrad")).rejects.toThrow();
    await expect(run({ kind: "disputeWork", orderId: "sample-1", comment: " " })).rejects.toThrow();
    await run({ kind: "disputeWork", orderId: "sample-1", comment: "Исправьте вход", seenRound: 1 });
    await run({ kind: "uploadFiles", orderId: "sample-1", files: await prepareFiles([file()]), comment: "Исправлено", seenRound: 2 }, "stroygrad");
    await run({ kind: "submitWork", orderId: "sample-1", seenRound: 2 }, "stroygrad");
    await expect(run({ kind: "confirmWork", orderId: "sample-1", seenRound: 1 })).rejects.toThrow("Сдача изменилась");
    const final = await run({ kind: "confirmWork", orderId: "sample-1", comment: "Принято", seenRound: 2 });
    const order = final.orders[0];
    expect(order.status).toBe(OrderStatus.COMPLETED);
    expect(order.submissions.map((s) => s.round)).toEqual([1, 2]);
    expect(order.clientCompletionComment).toBe("Принято");
    expect(order.verifiedSquareMeters).toBe(101.25);
    expect(contractors(final).find((c) => c.id === "stroygrad")?.completedOrdersCount).toBe(2);
    const hidden = orderForViewer(order, "remontplus");
    expect(hidden).toMatchObject({ files: [], submissions: [], price: null, client: null, verifiedSquareMeters: null, clientCompletionComment: null, correctionComment: null });
    expect(hidden.offers.map((o) => o.companyId)).toEqual(["remontplus"]);
    expect(JSON.stringify(orderForViewer(order, "anna"))).not.toContain('"blob"');
    await repo.close(); const restored = await repository(factory).read();
    expect(restored).toEqual(final);
    expect(await restored.orders[0].files.find((f) => f.id === files[0].id)!.blob!.text()).toBe(await file().text());
    const notices = selectNotifications(restored, "anna", { unread: true, page: 1 });
    expect(notices.items.some((n) => n.type === NotificationType.WORK_SUBMITTED)).toBe(true);
    await expect(run({ kind: "submitWork", orderId: "sample-1" }, "stroygrad")).rejects.toThrow();
  });

  it("edits, withdraws, resubmits and finally rejects without creating duplicate offers", async () => {
    const repo = repository(); const state = await repo.read();
    const run = (c: DemoCommand, actor = "stroygrad") => repo.execute(env(state.generation, c, actor));
    const submit = { kind: "submitOffer" as const, orderId: "sample-1", id: "offer", values: offerValues() };
    const first = await run(submit); const seen = first.orders[0].offers[0];
    const edited = await run({ ...submit, id: "ignored", values: { ...offerValues(), proposedPrice: "2500" }, seenUpdatedAt: seen.updatedAt });
    expect(edited.orders[0].offers).toHaveLength(1);
    expect(edited.orders[0].offers[0].editedAt).not.toBeNull();
    await expect(run({ kind: "acceptOffer", orderId: "sample-1", offerId: "offer", seenEditedAt: null }, "anna")).rejects.toThrow("изменила");
    await expect(run({ ...submit, seenUpdatedAt: seen.updatedAt })).rejects.toThrow("изменилось");
    await run({ kind: "withdrawOffer", orderId: "sample-1", offerId: "offer" });
    expect(selectAvailable(await repo.read(), "stroygrad", { q: "1001", page: 1 }).total).toBe(1);
    await run(submit);
    await run({ kind: "rejectOffer", orderId: "sample-1", offerId: "offer" }, "anna");
    await run(submit);
    const rejected = await run({ kind: "rejectOffer", orderId: "sample-1", offerId: "offer" }, "anna");
    expect(rejected.orders[0].offers[0].rejectionCount).toBe(2);
    await expect(run(submit)).rejects.toThrow("дважды");
    expect(selectAvailable(rejected, "stroygrad", { q: "1001", page: 1 }).total).toBe(0);
    expect(orderForViewer(rejected.orders[0], "stroygrad").canSubmitOffer).toBe(false);
  });

  it("validates role and ownership for every additional mutation", async () => {
    const repo = repository(); const run = await accepted(repo); const files = await prepareFiles([file()]);
    const commands: DemoCommand[] = [
      { kind: "uploadFiles", orderId: "sample-1", files, comment: "Файл" },
      { kind: "verifyArea", orderId: "sample-1", value: "200" },
      { kind: "submitWork", orderId: "sample-1" },
      { kind: "confirmWork", orderId: "sample-1" },
      { kind: "disputeWork", orderId: "sample-1", comment: "Правки" },
      { kind: "deleteOrder", orderId: "sample-1" },
      { kind: "withdrawOffer", orderId: "sample-1", offerId: "a" },
      { kind: "rejectOffer", orderId: "sample-1", offerId: "a" },
      { kind: "deleteFile", orderId: "sample-1", fileId: "sample-task-sample-1" },
    ];
    const before = await repo.read();
    for (const command of commands) await expect(run(command, "remontplus")).rejects.toThrow();
    expect(await repo.read()).toEqual(before);
  });
});

describe("local files and atomic storage", () => {
  it("checks file content and rejects active, disguised, empty and oversized uploads", async () => {
    for (const f of [new File(["<svg onload='alert(1)'/>"], "a.svg"), new File(["<html>"], "a.pdf"),
      new File([], "a.pdf"), new File([new Uint8Array(DEMO_FILE_BYTES + 1)], "huge.pdf")]) {
      await expect(prepareFiles([f])).rejects.toThrow();
    }
    await expect(prepareFiles(Array.from({ length: 11 }, () => file()))).rejects.toThrow("10 файлов");
    const prepared = await prepareFiles([file()]);
    expect(prepared[0].hash).toMatch(/^[a-f0-9]{64}$/);
    expect(prepared[0].blob.type).toBe("application/pdf");
  });
  it("stores creation and files atomically, deduplicates by round and permits deleting only draft files", async () => {
    const repo = repository(); const seed = await repo.read(); const files = await prepareFiles([file()]);
    const created = await repo.execute(env(seed.generation, { kind: "createOrder", id: "custom", values: orderValues, files }));
    expect(created.orders[0].files[0].blob?.size).toBe(files[0].blob.size);
    expect(canDeleteDemoFile(created.orders[0], files[0].id, "anna")).toBe(true);
    await repo.execute(env(seed.generation, { kind: "deleteFile", orderId: "custom", fileId: files[0].id }));
    const run = await accepted(repo);
    await run({ kind: "uploadFiles", orderId: "sample-1", files: await prepareFiles([file()]), comment: "Первая версия" }, "stroygrad");
    const before = await repo.read();
    const duplicate = await run({ kind: "uploadFiles", orderId: "sample-1", files: await prepareFiles([file("renamed.pdf")]), comment: "Обновлённый комментарий" }, "stroygrad");
    const o = duplicate.orders.find((o) => o.id === "sample-1")!;
    expect(o.files.filter((f) => f.ownerType === FileOwnerType.COMPANY)).toHaveLength(1);
    expect(duplicate.notifications).toHaveLength(before.notifications.length);
    await expect(run({ kind: "uploadFiles", orderId: "sample-1", files: await prepareFiles([file("plan.pdf", "different")]), comment: "Другое содержимое" }, "stroygrad")).rejects.toThrow("именем");
    await run({ kind: "deleteFile", orderId: "sample-1", fileId: o.files.find((f) => f.blob)!.id }, "stroygrad");
    await expect(run({ kind: "submitWork", orderId: "sample-1" }, "stroygrad")).rejects.toThrow("файлы");
  });
  it("aborts files, metadata and notifications together when IndexedDB cannot commit", async () => {
    const repo = repository(); const run = await accepted(repo); const before = await repo.read();
    const files = await prepareFiles([file()]);
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(function (this: IDBObjectStore, ...args) {
      const req = put.apply(this, args); req.addEventListener("success", () => this.transaction.abort()); return req;
    });
    await expect(run({ kind: "uploadFiles", orderId: "sample-1", files, comment: "Не сохранится" }, "stroygrad")).rejects.toThrow();
    expect(await repo.read()).toEqual(before);
  });
  it("enforces a global quota, frees it on deletion and clears all uploaded bytes on reset", async () => {
    const repo = repository(); const seed = await repo.read();
    const blob = new Blob([new Uint8Array(DEMO_FILE_BYTES)], { type: "application/pdf" });
    const files = Array.from({ length: 5 }, (_, i) => ({ id: `large-${i}`, name: `large-${i}.pdf`, hash: `hash-${i}`, blob }));
    await repo.execute(env(seed.generation, { kind: "createOrder", id: "full", values: orderValues, files }));
    const tiny = await prepareFiles([file()]);
    await expect(repo.execute(env(seed.generation, { kind: "createOrder", id: "overflow", values: orderValues, files: tiny }))).rejects.toThrow("50 МиБ");
    const full = await repo.read();
    expect(full.orders.find((o) => o.id === "full")?.filesSizeBytes).toBe(DEMO_TOTAL_BYTES);
    expect(full.orders.some((o) => o.id === "overflow")).toBe(false);
    await repo.execute(env(seed.generation, { kind: "deleteOrder", orderId: "full" }));
    await repo.execute(env(seed.generation, { kind: "createOrder", id: "small", values: orderValues, files: tiny }));
    expect((await repo.reset()).orders.flatMap((o) => o.files).some((f) => f.blob)).toBe(false);
  });
  it("ships every seeded asset with its declared byte count and readable DXF structure", () => {
    const state = createDemoState(); assertDemoState(state);
    const asset = readFileSync(new URL("../../../public/demo/room-plan.dxf", import.meta.url));
    for (const f of state.orders.flatMap((o) => o.files)) expect(f.sizeBytes).toBe(asset.length);
    expect(asset.toString()).toMatch(/^0\nSECTION/);
    expect(asset.toString()).toMatch(/0\nEOF\n$/);
  });
});

describe("lists, profiles and notices", () => {
  it("filters the entire collection before pagination and isolates company offers and documents", () => {
    const state = createDemoState();
    for (let i = 0; i < 45; i++) state.orders.push({ ...structuredClone(state.orders[0]), id: `extra-${i}`, orderNumber: 2000 + i, files: [], title: `Проект ${i}` });
    expect(selectOrders(state, "anna", { q: "Проект", status: null, page: 2 })).toMatchObject({ page: 2, totalPages: 3, items: expect.any(Array) });
    expect(selectOrders(state, "anna", { q: "ORD-2044", status: null, page: 1 }).items.map((o) => o.id)).toEqual(["extra-44"]);
    expect(selectOrders(state, "anna", { q: "", status: OrderStatus.COMPLETED, page: 1 }).total).toBe(1);
    expect(selectOrders(state, "anna", { q: "", status: null, page: 99 }).items).toEqual([]);
    expect(selectOffers(state, "remontplus", { status: null, page: 1 }).total).toBe(0);
    expect(selectDocuments(state, "remontplus", { ownerType: null, orderId: null, page: 1 }).total).toBe(0);
    expect(selectDocuments(state, "anna", { ownerType: FileOwnerType.COMPANY, orderId: "sample-4", page: 1 }).total).toBe(1);
    expect(paginate([], 1)).toMatchObject({ total: 0, totalPages: 1 });
  });
  it("updates profile references while preserving role and email, and reads only the actor's notices", async () => {
    const repo = repository(); const run = await accepted(repo);
    const initial = await repo.read(); const user = initial.users.find((u) => u.id === "stroygrad")!;
    const updated = await run({ kind: "updateProfile", values: { ...toProfileForm(user), companyName: "Новая компания" } }, "stroygrad");
    expect(updated.users.find((u) => u.id === user.id)).toMatchObject({ email: user.email, role: user.role });
    expect(updated.orders[0].contractorName).toBe("Новая компания");
    expect(updated.orders[0].offers.find((o) => o.companyId === user.id)?.companyName).toBe("Новая компания");
    const other = updated.notifications.find((n) => n.userId === "anna")!;
    await expect(run({ kind: "readNotifications", id: other.id }, "stroygrad")).rejects.toThrow();
    const read = await run({ kind: "readNotifications" }, "stroygrad");
    expect(read.notifications.filter((n) => n.userId === "stroygrad").every((n) => n.isRead)).toBe(true);
    expect(read.notifications.find((n) => n.id === other.id)?.isRead).toBe(false);
    expect((await run({ kind: "readNotifications" }, "stroygrad")).notifications).toEqual(read.notifications);
  });
  it("removes all order bytes and leaves an honest notification without a dead link", async () => {
    const repo = repository(); const seed = await repo.read();
    await repo.execute(env(seed.generation, { kind: "submitOffer", id: "offer", orderId: "sample-1", values: offerValues() }, "stroygrad"));
    const next = await repo.execute(env(seed.generation, { kind: "deleteOrder", orderId: "sample-1" }));
    expect(next.orders.some((o) => o.id === "sample-1")).toBe(false);
    expect(next.notifications.some((n) => n.orderId === "sample-1")).toBe(false);
    expect(next.notifications.find((n) => n.userId === "stroygrad")).toMatchObject({ orderId: null, type: NotificationType.ORDER_DELETED });
  });
  it("rejects corrupt files and submissions before UI rendering", () => {
    const state = createDemoState(); state.orders[0].files[0].assetPath = "https://unexpected.invalid";
    expect(() => assertDemoState(state)).toThrow("повреждены");
    const other = createDemoState(); other.orders[3].submissions[0].submittedAt = "invalid";
    expect(() => assertDemoState(other)).toThrow("повреждены");
  });
});
