import { ApiRequestError, type RequestOptions } from "@/lib/api";
import type { ObjectType, OrderCategory } from "@/lib/types";
import { errorMessage, executeDemo, getDemoSnapshot, reloadDemo } from "./store";
import { openRound, orderForViewer, type DemoCommand } from "./operations";
import { prepareFiles } from "./files";

/** Existing forms call local commands. There is deliberately no network fallback. */
export async function demoRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    const { actorId, state } = getDemoSnapshot();
    if (!actorId || !state) throw new Error("Выберите демо-профиль.");
    const method = options.method ?? "GET";
    const body = (options.body ?? {}) as Record<string, unknown>;
    const execute = (command: DemoCommand) => executeDemo(command, crypto.randomUUID(), { actorId, generation: state.generation });
    const data = options.body instanceof FormData ? options.body : null;
    const get = (key: string) => String(data?.get(key) ?? body[key] ?? "");
    const files = async () => prepareFiles((data?.getAll("files") ?? []).filter((f): f is File => typeof f !== "string"));
    let result: unknown;
    if (method === "POST" && path === "/orders" && data) {
      const id = crypto.randomUUID();
      const next = await execute({ kind: "createOrder", id, files: await files(), values: {
        title: get("title"), category: get("category") as OrderCategory, objectType: get("objectType") as ObjectType,
        description: get("description"), address: get("address"), squareMeters: get("squareMeters"),
        clientBudget: get("clientBudget"), desiredStartDate: get("desiredStartDate"),
      } });
      result = orderForViewer(next.orders.find((order) => order.id === id)!, actorId);
    } else if (method === "PATCH" && path === "/profile") {
      const next = await execute({ kind: "updateProfile", values: { firstName: get("firstName"), lastName: get("lastName"),
        phone: get("phone"), city: get("city"), country: get("country"), companyName: get("companyName") } });
      result = next.users.find((u) => u.id === actorId);
    } else if (method === "POST" && path === "/offers") {
      const orderId = get("orderId");
      const old = state.orders.find((o) => o.id === orderId)?.offers.find((o) => o.companyId === actorId);
      const next = await execute({ kind: "submitOffer", id: crypto.randomUUID(), orderId, seenUpdatedAt: body.seenUpdatedAt === null || typeof body.seenUpdatedAt === "string" ? body.seenUpdatedAt : old?.updatedAt ?? null,
        values: { proposedPrice: get("proposedPrice"), proposedDeadline: get("proposedDeadline"), comment: get("comment") } });
      result = next.orders.find((o) => o.id === orderId)!.offers.find((o) => o.companyId === actorId);
    } else if (path.startsWith("/notifications/")) {
      if (method === "GET" && path === "/notifications/unread-count") {
        result = { count: state.notifications.filter((n) => n.userId === actorId && !n.isRead).length };
      } else if (method === "POST") {
        const read = /^\/notifications\/([^/]+)\/read$/.exec(path);
        if (!read && path !== "/notifications/read-all") throw new Error("Действие не найдено.");
        const next = await execute({ kind: "readNotifications", id: read?.[1] });
        result = { marked: next.lastReadCount ?? 0 };
      } else throw new Error("Действие не найдено.");
    } else {
      const offerAction = /^\/offers\/([^/]+)\/(withdraw|reject)$/.exec(path);
      const orderAction = /^\/orders\/([^/]+)(?:\/(accept-offer|files|submit|confirm|dispute|verified-area)(?:\/([^/]+))?)?$/.exec(path);
      const fileAction = /^\/documents\/([^/]+)(?:\/(download))?$/.exec(path);
      if (method === "POST" && offerAction) {
        const order = state.orders.find((o) => o.offers.some((f) => f.id === offerAction[1]));
        if (!order) throw new Error("Предложение не найдено.");
        const offer = order.offers.find((o) => o.id === offerAction[1])!;
        await execute({ kind: offerAction[2] === "reject" ? "rejectOffer" : "withdrawOffer", orderId: order.id, offerId: offer.id, seenUpdatedAt: offer.updatedAt });
        result = {};
      } else if (fileAction) {
        const order = state.orders.find((o) => o.files.some((f) => f.id === fileAction[1]));
        if (!order || !orderForViewer(order, actorId).files.some((f) => f.id === fileAction[1])) throw new Error("Файл недоступен выбранному профилю.");
        const file = order.files.find((f) => f.id === fileAction[1])!;
        if (method === "DELETE" && !fileAction[2]) {
          await execute({ kind: "deleteFile", orderId: order.id, fileId: file.id });
          result = {};
        } else if (method === "GET" && fileAction[2]) {
          // Recheck persisted state before exposing a download after a reset in another tab.
          await reloadDemo();
          const current = getDemoSnapshot();
          const fresh = current.state?.orders.find((o) => o.id === order.id);
          if (current.error || !fresh || !orderForViewer(fresh, actorId).files.some((f) => f.id === file.id)) throw new Error("Файл больше недоступен. Обновите страницу.");
          const saved = fresh.files.find((f) => f.id === file.id)!;
          if (!saved.blob && !saved.assetPath) throw new Error("Содержимое файла отсутствует.");
          result = { url: saved.blob ? URL.createObjectURL(saved.blob) : saved.assetPath, originalName: saved.originalName };
        } else throw new Error("Действие не найдено.");
      } else if (orderAction) {
        const [, id, action, offerId] = orderAction;
        const order = state.orders.find((o) => o.id === id);
        if (!order) throw new Error("Заказ отсутствует в этом браузере.");
        let command: DemoCommand | undefined;
        if (method === "DELETE" && !action) command = { kind: "deleteOrder", orderId: id };
        else if (method === "POST" && action === "accept-offer" && offerId) {
          if (!(body.offerEditedAt === null || typeof body.offerEditedAt === "string")) throw new Error("Обновите условия предложения перед принятием.");
          command = { kind: "acceptOffer", orderId: id, offerId, seenEditedAt: body.offerEditedAt };
        } else if (method === "POST" && action === "files" && data) command = { kind: "uploadFiles", orderId: id, files: await files(), comment: get("comment"), seenRound: data.has("seenRound") ? Number(data.get("seenRound")) : openRound(order) };
        else if (method === "PATCH" && action === "verified-area") command = { kind: "verifyArea", orderId: id, value: get("verifiedSquareMeters") };
        else if (method === "POST" && (action === "submit" || action === "confirm" || action === "dispute")) command = {
          kind: action === "submit" ? "submitWork" : action === "confirm" ? "confirmWork" : "disputeWork", orderId: id,
          comment: get(action === "dispute" ? "correctionComment" : "comment"), seenRound: typeof body.seenRound === "number" ? body.seenRound : order.submissions.at(-1)?.round ?? 0,
        };
        else if (!(method === "GET" && !action)) throw new Error("Действие не найдено.");
        const next = command ? await execute(command) : state;
        const updated = next.orders.find((o) => o.id === id);
        result = updated ? orderForViewer(updated, actorId) : {};
      } else throw new Error("Действие не найдено.");
    }
    return result as T;
  } catch (error) {
    throw new ApiRequestError(409, errorMessage(error), null);
  }
}
