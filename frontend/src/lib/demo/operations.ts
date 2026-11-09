import {
  ACTIVE_OFFER_STATUSES, EXECUTOR_OFFER_STATUSES, ObjectType, OrderCategory, OrderEventType, OrderStateMachine,
  OrderStatus, OfferStatus, Role, FileOwnerType, NotificationType, notificationTypeLabels,
  canTransition, canDeleteOrder, canUploadWork, canVerifyArea, isFinallyRejected, companySeesTaskFiles,
  type OrderDetail, type OrderEvent, type OfferDto,
} from "@/lib/types";
import { normalizeNumber } from "@/lib/form-input";
import { validateOrderForm, validateSquareMeters, type OrderFormValues } from "@/lib/order-form";
import { validateOfferForm, type OfferFormValues } from "@/lib/offer-form";
import { validateCompletionComment, validateCorrectionComment } from "@/lib/completion-form";
import { validateProfileForm, type ProfileFormValues } from "@/lib/profile-form";
import { assertDemoState, type DemoState, type DemoOrder } from "./model";
import { DEMO_FILE_BYTES, DEMO_TOTAL_BYTES, type PreparedFile } from "./files";

export type DemoCommand =
  | { kind: "createOrder"; values: OrderFormValues; id: string; files?: PreparedFile[] }
  | { kind: "submitOffer"; orderId: string; values: OfferFormValues; id: string; seenUpdatedAt?: string | null }
  | { kind: "acceptOffer"; orderId: string; offerId: string; seenEditedAt: string | null }
  | { kind: "withdrawOffer" | "rejectOffer"; orderId: string; offerId: string; seenUpdatedAt?: string }
  | { kind: "submitWork" | "confirmWork" | "disputeWork"; orderId: string; comment?: string; seenRound?: number }
  | { kind: "uploadFiles"; orderId: string; files: PreparedFile[]; comment: string; seenRound?: number }
  | { kind: "verifyArea"; orderId: string; value: string }
  | { kind: "deleteOrder"; orderId: string }
  | { kind: "deleteFile"; orderId: string; fileId: string }
  | { kind: "readNotifications"; id?: string }
  | { kind: "updateProfile"; values: ProfileFormValues };

export interface CommandEnvelope { actorId: string; generation: string; operationId: string; command: DemoCommand }
const machine = new OrderStateMachine();
function validate(errors: Record<string, string | undefined>) {
  const messages = Object.values(errors).filter(Boolean);
  if (messages.length) throw new Error(messages.join(". "));
}
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
export function openRound(order: DemoOrder) {
  const latest = order.submissions.at(-1);
  return latest && !latest.submittedAt ? latest.round : (latest?.round ?? 0) + 1;
}
export function canDeleteDemoFile(order: DemoOrder, fileId: string, actorId: string) {
  const file = order.files.find((f) => f.id === fileId);
  if (!file) return false;
  return file.ownerType === FileOwnerType.CLIENT ? order.ownerId === actorId && canDeleteOrder(order.status)
    : order.offers.some((o) => o.companyId === actorId && EXECUTOR_OFFER_STATUSES.includes(o.status))
      && canUploadWork(order.status) && file.submissionRound === openRound(order);
}
function attachFiles(state: DemoState, order: DemoOrder, files: PreparedFile[], ownerType: FileOwnerType, round: number, date: string) {
  check(files.length <= 10, "Можно добавить не более 10 файлов за раз.");
  let used = state.orders.flatMap((o) => o.files).reduce((sum, f) => sum + (f.blob?.size ?? 0), 0);
  let added = 0;
  for (const file of files) {
    check(file.blob.size > 0 && file.blob.size <= DEMO_FILE_BYTES, "В демо допускаются непустые файлы до 10 МиБ.");
    const existing = order.files.filter((f) => f.ownerType === ownerType && f.submissionRound === round);
    if (existing.some((f) => f.hash === file.hash)) continue;
    check(!existing.some((f) => f.originalName.toLowerCase() === file.name.toLowerCase()), "Файл с таким именем уже приложен. Переименуйте новый файл.");
    used += file.blob.size;
    check(used <= DEMO_TOTAL_BYTES, "Лимит демо — 50 МиБ пользовательских файлов во всех заказах. Удалите ненужные файлы.");
    order.files.push({ id: file.id, orderId: order.id, ownerType, submissionRound: round,
      originalName: file.name, mimeType: file.blob.type, sizeBytes: file.blob.size, createdAt: date, blob: file.blob, hash: file.hash });
    added++;
  }
  order.filesSizeBytes = order.files.reduce((sum, f) => sum + f.sizeBytes, 0);
  return added;
}
function notify(state: DemoState, order: DemoOrder, userId: string, type: NotificationType, body: string, date: string) {
  state.notifications.push({ id: crypto.randomUUID(), orderId: order.id, userId, type,
    title: notificationTypeLabels[type], body, collapseKey: null, isRead: false, createdAt: date });
}

/** Runs synchronously inside one IndexedDB read/write transaction. */
export function applyCommand(original: DemoState, envelope: CommandEnvelope, now = new Date()): DemoState {
  assertDemoState(original);
  check(envelope.generation === original.generation, "Демо было сброшено в другой вкладке. Обновите страницу.");
  if (original.operations.includes(envelope.operationId)) return original;
  const state = structuredClone(original);
  const actor = state.users.find((user) => user.id === envelope.actorId);
  check(actor, "Выберите демо-профиль.");
  const { command } = envelope;
  const date = now.toISOString();
  if (command.kind === "readNotifications") {
    if (command.id) check(state.notifications.some((n) => n.id === command.id && n.userId === actor.id), "Уведомление не найдено.");
    state.lastReadCount = 0;
    state.notifications.forEach((n) => { if (!n.isRead && n.userId === actor.id && (!command.id || n.id === command.id)) { n.isRead = true; state.lastReadCount!++; } });
  } else if (command.kind === "updateProfile") {
    validate(validateProfileForm(command.values, actor.role));
    const v = command.values;
    Object.assign(actor, { firstName: v.firstName.trim(), lastName: v.lastName.trim() || null, phone: v.phone.trim(),
      city: v.city.trim() || null, country: v.country.trim() || null,
      companyName: actor.role === Role.COMPANY ? v.companyName.trim() : null, updatedAt: date });
    for (const order of state.orders) {
      if (order.ownerId === actor.id) order.client = actor;
      for (const offer of order.offers) if (offer.companyId === actor.id) {
        offer.companyName = actor.companyName!;
        if (EXECUTOR_OFFER_STATUSES.includes(offer.status)) order.contractorName = actor.companyName;
      }
    }
  } else if (command.kind === "createOrder") {
    check(actor.role === Role.CLIENT, "Заказ создаёт клиент.");
    validate(validateOrderForm(command.values));
    const values = command.values;
    check(Object.values(OrderCategory).includes(values.category as OrderCategory)
      && Object.values(ObjectType).includes(values.objectType as ObjectType), "Выберите категорию и тип объекта.");
    check(!state.orders.some((o) => o.id === command.id), "Этот заказ уже создан.");
    const order: DemoOrder = {
      id: command.id, orderNumber: Math.max(1000, ...state.orders.map((o) => o.orderNumber)) + 1,
      ownerId: actor.id, client: actor, title: values.title.trim(), description: values.description.trim(),
      category: values.category as OrderCategory, objectType: values.objectType as ObjectType,
      address: values.address.trim(), squareMeters: Number(normalizeNumber(values.squareMeters)),
      clientBudget: normalizeNumber(values.clientBudget) || null,
      desiredStartDate: values.desiredStartDate ? `${values.desiredStartDate}T00:00:00.000Z` : null,
      status: OrderStatus.WAITING, verifiedSquareMeters: null, price: null, deadline: null,
      contractorName: null, clientCompletionComment: null, correctionComment: null,
      offers: [], files: [], filesSizeBytes: 0, submissions: [], canSubmitOffer: false,
      createdAt: date, updatedAt: date,
    };
    state.orders.unshift(order);
    attachFiles(state, order, command.files ?? [], FileOwnerType.CLIENT, 0, date);
  } else {
    const order = state.orders.find((o) => o.id === command.orderId);
    check(order, "Заказ отсутствует в этом браузере.");
    const owner = actor.role === Role.CLIENT && order.ownerId === actor.id;
    const executor = order.offers.find((o) => EXECUTOR_OFFER_STATUSES.includes(o.status));
    const isExecutor = actor.role === Role.COMPANY && executor?.companyId === actor.id;
    let event: OrderEvent | undefined;
    if (command.kind === "deleteOrder") {
      check(owner && canDeleteOrder(order.status), "Удалить заказ может его клиент до начала работ.");
      for (const offer of order.offers) notify(state, order, offer.companyId, NotificationType.ORDER_DELETED, `Заказ ORD-${order.orderNumber} удалён клиентом.`, date);
      state.notifications.forEach((n) => { if (n.orderId === order.id) n.orderId = null; });
      state.orders = state.orders.filter((o) => o.id !== order.id);
    } else if (command.kind === "deleteFile") {
      const file = order.files.find((f) => f.id === command.fileId);
      check(file, "Файл уже удалён.");
      check(canDeleteDemoFile(order, file.id, actor.id), "Можно удалить только свои файлы до отправки работы или начала сделки.");
      order.files = order.files.filter((f) => f.id !== file.id);
      order.filesSizeBytes = order.files.reduce((sum, f) => sum + f.sizeBytes, 0);
    } else if (command.kind === "uploadFiles") {
      check(isExecutor && canUploadWork(order.status), "Файлы добавляет исполнитель до сдачи работы.");
      validate({ comment: validateCorrectionComment(command.comment) });
      check(command.files.length, "Приложите хотя бы один файл.");
      const round = openRound(order);
      check(command.seenRound === undefined || command.seenRound === round, "Номер сдачи изменился. Обновите страницу.");
      const added = attachFiles(state, order, command.files, FileOwnerType.COMPANY, round, date);
      const submission = order.submissions.find((s) => s.round === round);
      if (submission) submission.comment = command.comment.trim();
      else order.submissions.push({ round, comment: command.comment.trim(), createdAt: date, submittedAt: null });
      if (added) notify(state, order, order.ownerId, NotificationType.FILES_UPDATED, `ORD-${order.orderNumber}: исполнитель добавил файлы к сдаче №${round}.`, date);
    } else if (command.kind === "verifyArea") {
      check(isExecutor && canVerifyArea(order.status), "Площадь уточняет исполнитель до завершения заказа.");
      validate({ area: validateSquareMeters(command.value) });
      order.verifiedSquareMeters = Number(normalizeNumber(command.value));
      notify(state, order, order.ownerId, NotificationType.AREA_VERIFIED, `ORD-${order.orderNumber}: площадь уточнена — ${order.verifiedSquareMeters} м².`, date);
    } else if (command.kind === "submitOffer") {
      check(actor.role === Role.COMPANY, "Предложение отправляет компания.");
      validate(validateOfferForm(command.values));
      const previous = order.offers.find((o) => o.companyId === actor.id);
      check(command.seenUpdatedAt === undefined || (previous?.updatedAt ?? null) === command.seenUpdatedAt, "Предложение изменилось. Обновите страницу.");
      const offer: OfferDto = previous ?? {
        id: command.id, orderId: order.id, companyId: actor.id, companyName: actor.companyName!,
        status: OfferStatus.SENT, proposedPrice: "", proposedDeadline: "", comment: null,
        rejectionCount: 0, editedAt: null, createdAt: date, updatedAt: date,
      };
      event = { type: OrderEventType.OFFER_SUBMITTED, offerId: offer.id, companyId: actor.id,
        companyName: actor.companyName!, offerStatus: previous?.status ?? null, rejectionCount: offer.rejectionCount };
      Object.assign(offer, { proposedPrice: normalizeNumber(command.values.proposedPrice),
        proposedDeadline: `${command.values.proposedDeadline}T00:00:00.000Z`, comment: command.values.comment.trim() || null });
      // A strictly increasing timestamp also distinguishes edits in the same millisecond.
      if (previous) offer.editedAt = new Date(Math.max(now.getTime(), Date.parse(previous.updatedAt) + 1)).toISOString();
      else order.offers.push(offer);
    } else if (command.kind === "acceptOffer" || command.kind === "rejectOffer" || command.kind === "withdrawOffer") {
      const offer = order.offers.find((o) => o.id === command.offerId);
      check(offer, "Предложение не найдено.");
      check(command.kind === "withdrawOffer" ? actor.role === Role.COMPANY && offer.companyId === actor.id : owner, "Это действие недоступно выбранному профилю.");
      if (command.kind === "acceptOffer") {
        event = { type: OrderEventType.OFFER_ACCEPTED, offerId: offer.id, companyId: offer.companyId,
          offerStatus: offer.status, proposedPrice: offer.proposedPrice, proposedDeadline: new Date(offer.proposedDeadline),
          offerEditedAt: offer.editedAt, seenOfferEditedAt: command.seenEditedAt, today: date.slice(0, 10),
          otherOffers: order.offers.filter((o) => o.id !== offer.id && o.status === OfferStatus.SENT).map((o) => ({ offerId: o.id, companyId: o.companyId })),
        };
      } else {
        check(command.seenUpdatedAt === undefined || command.seenUpdatedAt === offer.updatedAt, "Предложение изменилось. Обновите страницу.");
        event = { type: command.kind === "rejectOffer" ? OrderEventType.OFFER_REJECTED : OrderEventType.OFFER_WITHDRAWN,
          offerId: offer.id, companyId: offer.companyId, offerStatus: offer.status,
          otherActiveOffers: order.offers.filter((o) => o.id !== offer.id && o.status === OfferStatus.SENT).length };
      }
    } else if (command.kind === "submitWork" || command.kind === "confirmWork" || command.kind === "disputeWork") {
      check(executor, "Исполнитель ещё не выбран.");
      const latest = order.submissions.at(-1);
      check(command.seenRound === undefined || latest?.round === command.seenRound, "Сдача изменилась. Обновите страницу.");
      const ref = { offerId: executor.id, companyId: executor.companyId, offerStatus: executor.status };
      if (command.kind === "submitWork") {
        check(isExecutor, "Работу сдаёт выбранный исполнитель.");
        check(latest && !latest.submittedAt && latest.comment.trim() && order.files.some((f) => f.ownerType === FileOwnerType.COMPANY && f.submissionRound === latest.round), "Перед сдачей добавьте файлы и комментарий.");
        event = { type: OrderEventType.WORK_SUBMITTED, ...ref };
        latest.submittedAt = date;
      } else {
        check(owner, "Работу принимает заказчик.");
        check(latest?.submittedAt, "Работа ещё не сдана.");
        const comment = command.comment?.trim() ?? "";
        validate({ comment: command.kind === "confirmWork" ? validateCompletionComment(comment) : validateCorrectionComment(comment) });
        event = command.kind === "confirmWork" ? { type: OrderEventType.WORK_CONFIRMED, completionComment: comment || undefined, ...ref }
          : { type: OrderEventType.WORK_DISPUTED, correctionComment: comment, ...ref };
      }
    }
    if (event) {
      const result = machine.transition({ orderId: order.id, orderNumber: order.orderNumber, title: order.title, clientId: order.ownerId, status: order.status }, event);
      order.status = result.nextStatus;
      for (const effect of result.effects) {
        switch (effect.kind) {
          case "SET_OFFER_STATUS": {
            const offer = order.offers.find((o) => o.id === effect.offerId);
            check(offer, "Нарушена целостность предложения.");
            offer.status = effect.status;
            offer.updatedAt = new Date(Math.max(now.getTime(), Date.parse(offer.updatedAt) + 1)).toISOString();
            if (effect.status === OfferStatus.REJECTED) offer.rejectionCount++;
            if (effect.status === OfferStatus.ACCEPTED) order.contractorName = offer.companyName;
            break;
          }
          case "SET_ORDER_DEAL": order.price = effect.price; order.deadline = effect.deadline.toISOString(); break;
          case "SET_COMPLETION_COMMENT": order.clientCompletionComment = effect.comment; break;
          case "SET_CORRECTION_COMMENT": order.correctionComment = effect.comment; break;
          case "CREATE_NOTIFICATION":
            state.notifications = state.notifications.filter((n) => n.isRead || !effect.collapseKey || n.userId !== effect.userId || n.collapseKey !== effect.collapseKey);
            state.notifications.push({ ...effect, id: crypto.randomUUID(), orderId: order.id, isRead: false, createdAt: date });
            break;
        }
      }
    }
    order.updatedAt = date;
  }
  state.revision++;
  state.operations.push(envelope.operationId);
  return state;
}

export function orderForViewer(order: DemoOrder, actorId: string): OrderDetail {
  const own = order.ownerId === actorId;
  const offer = order.offers.find((o) => o.companyId === actorId);
  const participant = own || Boolean(offer && ACTIVE_OFFER_STATUSES.includes(offer.status));
  const executor = own || Boolean(offer && EXECUTOR_OFFER_STATUSES.includes(offer.status));
  const { ownerId: _ownerId, ...detail } = order;
  void _ownerId;
  return structuredClone({
    ...detail, offers: own ? order.offers.filter((o) => ACTIVE_OFFER_STATUSES.includes(o.status)) : order.offers.filter((o) => o.companyId === actorId),
    status: participant ? order.status : OrderStatus.WAITING,
    price: participant ? order.price : null, deadline: participant ? order.deadline : null,
    contractorName: participant ? order.contractorName : null, client: executor ? order.client : null,
    updatedAt: participant ? order.updatedAt : order.createdAt,
    verifiedSquareMeters: executor ? order.verifiedSquareMeters : null,
    clientCompletionComment: executor ? order.clientCompletionComment : null, correctionComment: executor ? order.correctionComment : null,
    files: order.files.filter((f) => executor || (f.ownerType === FileOwnerType.CLIENT && companySeesTaskFiles(order.status, offer?.status ?? null)))
      .map(({ blob: _blob, assetPath: _asset, hash: _hash, ...file }) => { void _blob; void _asset; void _hash; return file; }),
    submissions: executor ? order.submissions : [], filesSizeBytes: executor ? order.filesSizeBytes : null,
    canSubmitOffer: !own && canTransition(order.status, OrderEventType.OFFER_SUBMITTED, offer?.status ?? null)
      && !isFinallyRejected(offer?.status ?? null, offer?.rejectionCount ?? 0),
  });
}
export function orderHref(id: string) { return `/orders/view/?id=${encodeURIComponent(id)}`; }
