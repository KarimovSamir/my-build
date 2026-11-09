import {
  ObjectType, OfferStatus, OrderCategory, OrderStatus, Role, FileOwnerType, NotificationType,
  type OrderDetail, type UserProfile, type OrderFileDto, type NotificationDto,
} from "@/lib/types";

export const DEMO_VERSION = 2;
export interface DemoFile extends OrderFileDto { blob?: Blob; assetPath?: string; hash: string }
export interface DemoOrder extends Omit<OrderDetail, "files"> { ownerId: string; files: DemoFile[] }
export interface DemoNotification extends NotificationDto {
  userId: string; collapseKey: string | null;
}
export interface DemoState {
  version: number;
  revision: number;
  generation: string;
  users: UserProfile[];
  orders: DemoOrder[];
  notifications: DemoNotification[];
  operations: string[];
  lastReadCount?: number;
}

export function createDemoState(now = new Date()): DemoState {
  const date = now.toISOString();
  const users: UserProfile[] = [
    { id: "anna", email: "anna.client@mybuild.test", role: Role.CLIENT, firstName: "Анна", lastName: "Соколова", phone: "+994501110001", companyName: null },
    { id: "stroygrad", email: "info@stroygrad.mybuild.test", role: Role.COMPANY, firstName: "Александр", lastName: "Иванов", phone: "+994501110002", companyName: "СтройГрад" },
    { id: "remontplus", email: "info@remontplus.mybuild.test", role: Role.COMPANY, firstName: "Дмитрий", lastName: "Петров", phone: "+994501110003", companyName: "Ремонт Плюс" },
  ].map((user) => ({ ...user, city: "Баку", country: "Азербайджан", createdAt: date, updatedAt: date }));
  const seed = [
    { title: "Ремонт квартиры 100 м²", description: "Подготовить стены, заменить напольное покрытие и выполнить чистовую отделку квартиры. Материалы согласовать с заказчиком.", squareMeters: 100, address: "Баку, ул. Низами, 84", clientBudget: "30600", category: OrderCategory.PLAN_IMPLEMENTATION, objectType: ObjectType.APARTMENT },
    { title: "Проект загородного дома", description: "Разработать планировку и рабочие чертежи двухэтажного дома. Предусмотреть кабинет и две детские комнаты.", squareMeters: 180, address: "Баку, посёлок Мардакян", clientBudget: "12000", category: OrderCategory.PLAN_CREATION, objectType: ObjectType.HOUSE },
  ];
  const state: DemoState = {
    version: DEMO_VERSION, revision: 0, generation: crypto.randomUUID(), users,
    notifications: [], operations: [],
    orders: seed.map((item, index) => ({
      ...item, id: `sample-${index + 1}`, orderNumber: 1001 + index,
      ownerId: users[0].id, client: users[0], status: OrderStatus.WAITING,
      verifiedSquareMeters: null, desiredStartDate: null, price: null, deadline: null,
      contractorName: null, clientCompletionComment: null, correctionComment: null,
      offers: [], files: [], filesSizeBytes: 0, submissions: [], canSubmitOffer: false,
      createdAt: date, updatedAt: date,
    })),
  };
  const future = new Date(now.getTime() + 30 * 86400000).toISOString();
  const past = new Date(now.getTime() - 2 * 86400000).toISOString();
  const scenarios = [
    { title: "Отделка офиса", status: OrderStatus.IN_PROGRESS, offer: OfferStatus.ACCEPTED },
    { title: "Планировка мастерской", status: OrderStatus.AWAITING_COMPLETION_CONFIRMATION, offer: OfferStatus.WORK_SUBMITTED },
    { title: "Доработка проекта кухни", status: OrderStatus.COMPLETION_DISPUTED, offer: OfferStatus.BACK_FOR_OVERRIDE },
    { title: "Завершённый проект гостиной", status: OrderStatus.COMPLETED, offer: OfferStatus.COMPLETED },
  ];
  for (const [index, scenario] of scenarios.entries()) {
    const order = structuredClone(state.orders[index % 2]);
    order.id = "sample-" + (index + 3);
    order.orderNumber = 1003 + index;
    order.title = scenario.title;
    order.status = scenario.status;
    order.createdAt = past;
    order.price = "8500";
    order.deadline = future;
    order.contractorName = users[1].companyName;
    order.offers = [{ id: "seed-offer-" + index, orderId: order.id, companyId: users[1].id, companyName: users[1].companyName!,
      status: scenario.offer, proposedPrice: "8500", proposedDeadline: future, comment: "Работы по согласованному плану.",
      rejectionCount: 0, editedAt: null, createdAt: past, updatedAt: date }];
    if (index > 0) {
      order.submissions = [{ round: 1, comment: "Подготовлен демонстрационный чертёж помещения. Проверьте расположение и размеры.", createdAt: past, submittedAt: date }];
      order.files.push({ id: "sample-result-" + index, orderId: order.id, ownerType: FileOwnerType.COMPANY, submissionRound: 1,
        originalName: "Пример-плана.dxf", mimeType: "application/dxf", sizeBytes: 272, createdAt: past,
        assetPath: "/demo/room-plan.dxf", hash: "seed-room-plan" });
    }
    if (scenario.status === OrderStatus.COMPLETION_DISPUTED) order.correctionComment = "Уточните расположение входа и добавьте размеры.";
    if (scenario.status === OrderStatus.COMPLETED) order.clientCompletionComment = "Работа принята. Спасибо!";
    state.orders.push(order);
  }
  for (const order of state.orders) {
    order.files.push({ id: "sample-task-" + order.id, orderId: order.id, ownerType: FileOwnerType.CLIENT, submissionRound: 0,
      originalName: "План-помещения.dxf", mimeType: "application/dxf", sizeBytes: 272, createdAt: date,
      assetPath: "/demo/room-plan.dxf", hash: "seed-room-plan" });
    order.filesSizeBytes = order.files.reduce((total, f) => total + f.sizeBytes, 0);
  }
  return state;
}

export class DemoDataError extends Error {}

/** Validate persisted data before exposing it to UI or applying a command. */
export function assertDemoState(value: unknown): asserts value is DemoState {
  if (!value || typeof value !== "object") throw new DemoDataError("Локальные данные повреждены. Начните демо заново.");
  const state = value as Partial<DemoState>;
  if (state.version !== DEMO_VERSION) throw new DemoDataError("Версия локальных данных изменилась. Начните демо заново.");
  if (!Number.isSafeInteger(state.revision) || state.revision! < 0 || typeof state.generation !== "string" || !state.generation
    || !Array.isArray(state.users) || state.users.length !== 3
    || !state.users.every((u) => u && typeof u.id === "string" && Object.values(Role).includes(u.role) && typeof u.firstName === "string"
      && typeof u.email === "string" && typeof u.phone === "string" && (u.lastName === null || typeof u.lastName === "string")
      && (u.city === null || typeof u.city === "string") && (u.country === null || typeof u.country === "string")
      && (u.role === Role.COMPANY ? typeof u.companyName === "string" && u.companyName.length > 0 : u.companyName === null))
    || !Array.isArray(state.orders) || !Array.isArray(state.notifications) || !Array.isArray(state.operations)
    || new Set(state.users.map((u) => u.id)).size !== state.users.length
    || !state.notifications.every((n) => n && typeof n.id === "string" && Object.values(NotificationType).includes(n.type) && typeof n.title === "string"
      && (n.body === null || typeof n.body === "string") && typeof n.isRead === "boolean"
      && Number.isFinite(Date.parse(n.createdAt)) && (n.orderId === null || state.orders!.some((o) => o?.id === n.orderId))
      && state.users!.some((u) => u.id === n.userId))
    || !state.operations.every((id) => typeof id === "string")
    || !state.orders.every((o) => o && typeof o.id === "string" && typeof o.title === "string"
      && typeof o.description === "string" && typeof o.address === "string"
      && Number.isSafeInteger(o.orderNumber) && Number.isFinite(o.squareMeters)
      && Object.values(OrderStatus).includes(o.status) && Object.values(OrderCategory).includes(o.category)
      && Object.values(ObjectType).includes(o.objectType)
      && state.users!.some((u) => u.id === o.ownerId && u.role === Role.CLIENT)
      && o.client?.id === o.ownerId && typeof o.client.firstName === "string"
      && Number.isFinite(Date.parse(o.createdAt)) && Number.isFinite(Date.parse(o.updatedAt)) && Array.isArray(o.offers)
      && Array.isArray(o.files) && Array.isArray(o.submissions)
      && o.files.every((f) => f && typeof f.id === "string" && f.orderId === o.id
        && typeof f.originalName === "string" && typeof f.mimeType === "string" && typeof f.hash === "string"
        && Object.values(FileOwnerType).includes(f.ownerType) && Number.isSafeInteger(f.submissionRound) && f.submissionRound >= 0
        && Number.isSafeInteger(f.sizeBytes) && f.sizeBytes > 0
        && (f.blob instanceof Blob ? f.blob.size === f.sizeBytes : f.assetPath === "/demo/room-plan.dxf"))
      && o.submissions.every((s) => s && Number.isSafeInteger(s.round) && s.round > 0 && typeof s.comment === "string"
        && Number.isFinite(Date.parse(s.createdAt)) && (s.submittedAt === null || Number.isFinite(Date.parse(s.submittedAt))))
      && o.offers.every((offer) => offer && typeof offer.id === "string" && offer.orderId === o.id
        && typeof offer.proposedPrice === "string" && Number.isFinite(Date.parse(offer.proposedDeadline))
        && Object.values(OfferStatus).includes(offer.status) && typeof offer.companyName === "string"
        && Number.isSafeInteger(offer.rejectionCount) && offer.rejectionCount >= 0
        && Number.isFinite(Date.parse(offer.createdAt)) && Number.isFinite(Date.parse(offer.updatedAt))
        && (offer.editedAt === null || Number.isFinite(Date.parse(offer.editedAt)))
        && state.users!.some((u) => u.id === offer.companyId && u.role === Role.COMPANY)))) {
    throw new DemoDataError("Локальные данные повреждены. Начните демо заново.");
  }
}
