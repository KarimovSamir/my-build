import { DEFAULT_PAGE_SIZE, EXECUTOR_OFFER_STATUSES, OfferStatus, Role, type Paginated, type ContractorCard } from "@/lib/types";
import type { OrdersFilter } from "@/lib/orders-filter";
import type { AvailableFilter } from "@/lib/available-filter";
import type { CompanyOffersFilter } from "@/lib/offers-filter";
import type { ContractorsFilter } from "@/lib/contractors-filter";
import type { DocumentsFilter } from "@/lib/documents-filter";
import type { NotificationsFilter } from "@/lib/notifications-filter";
import { orderForViewer } from "./operations";
import type { DemoState, DemoOrder } from "./model";

export function paginate<T>(items: T[], page: number, pageSize = DEFAULT_PAGE_SIZE): Paginated<T> {
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length,
    page, pageSize, totalPages: Math.max(1, Math.ceil(items.length / pageSize)) };
}
const search = (text: string, q: string) => text.toLocaleLowerCase("ru").includes(q.toLocaleLowerCase("ru"));
const matchesOrder = (o: DemoOrder, q: string) => search(o.title, q) || `ord-${o.orderNumber}`.includes(q.toLowerCase()) || String(o.orderNumber) === q;
const newest = <T extends { createdAt: string; id: string }>(items: T[]) => items.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
export const isParty = (order: DemoOrder, actorId: string) => order.ownerId === actorId || order.offers.some((o) => o.companyId === actorId && EXECUTOR_OFFER_STATUSES.includes(o.status));
export function selectOrders(state: DemoState, actorId: string, filter: OrdersFilter) {
  return paginate(newest(state.orders.filter((o) => o.ownerId === actorId && (!filter.status || o.status === filter.status) && matchesOrder(o, filter.q)))
    .map((o) => orderForViewer(o, actorId)), filter.page);
}
export function selectAvailable(state: DemoState, actorId: string, filter: AvailableFilter) {
  const items = newest(state.orders.filter((o) => matchesOrder(o, filter.q))).filter((o) => {
    const detail = orderForViewer(o, actorId);
    return detail.canSubmitOffer && !o.offers.some((f) => f.companyId === actorId && f.status === OfferStatus.SENT);
  }).map((o) => ({ ...orderForViewer(o, actorId), ownOffer: o.offers.find((f) => f.companyId === actorId) ?? null }));
  return paginate(items, filter.page);
}
export function selectOffers(state: DemoState, actorId: string, filter: CompanyOffersFilter) {
  return paginate(newest(state.orders.flatMap((o) => o.offers.filter((f) => f.companyId === actorId && (!filter.status || f.status === filter.status))
    .map((f) => ({ ...f, order: orderForViewer(o, actorId) })))), filter.page);
}
export function contractors(state: DemoState): ContractorCard[] {
  return state.users.filter((u) => u.role === Role.COMPANY).map((u) => ({ id: u.id, companyName: u.companyName!, city: u.city, country: u.country,
    email: u.email, phone: u.phone, completedOrdersCount: state.orders.filter((o) => o.offers.some((f) => f.companyId === u.id && f.status === OfferStatus.COMPLETED)).length }));
}
export function selectContractors(state: DemoState, filter: ContractorsFilter) {
  return paginate(contractors(state).filter((c) => search(`${c.companyName} ${c.city ?? ""}`, filter.q))
    .sort((a, b) => a.companyName.localeCompare(b.companyName, "ru")), filter.page);
}
export function selectDocuments(state: DemoState, actorId: string, filter: DocumentsFilter) {
  return paginate(newest(state.orders.filter((o) => isParty(o, actorId) && (!filter.orderId || o.id === filter.orderId))
    .flatMap((o) => orderForViewer(o, actorId).files.filter((f) => !filter.ownerType || f.ownerType === filter.ownerType)
      .map((f) => ({ ...f, orderNumber: o.orderNumber, orderTitle: o.title })))), filter.page);
}
export function selectNotifications(state: DemoState, actorId: string, filter: NotificationsFilter) {
  return paginate(newest(state.notifications.filter((n) => n.userId === actorId && (!filter.unread || !n.isRead)))
    .sort((a, b) => Number(a.isRead) - Number(b.isRead)), filter.page);
}
