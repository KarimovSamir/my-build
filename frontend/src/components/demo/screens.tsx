"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ListSearch } from "@/components/list-search";
import { StatusTabs } from "@/components/status-tabs";
import { NewOrderForm } from "@/components/orders/new-order-form";
import { OrdersList } from "@/components/orders/orders-list";
import { OrdersStatusTabs } from "@/components/orders/orders-status-tabs";
import { OrderLive } from "@/components/orders/order-live";
import { AvailableOrdersList } from "@/components/offers/available-orders-list";
import { CompanyOffersList } from "@/components/offers/company-offers-list";
import { ContractorsList } from "@/components/contractors/contractors-list";
import { ContractorProfile } from "@/components/contractors/contractor-profile";
import { DocumentsList } from "@/components/documents/documents-list";
import { OrderSelect } from "@/components/documents/order-select";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { MarkAllReadButton } from "@/components/notifications/mark-all-read-button";
import { ProfileForm } from "@/components/settings/profile-form";
import { useDemo } from "./provider";
import { orderForViewer } from "@/lib/demo/operations";
import { contractors, isParty, selectAvailable, selectContractors, selectDocuments, selectNotifications, selectOffers, selectOrders } from "@/lib/demo/selectors";
import { Role, offerStatusLabels, FileOwnerType } from "@/lib/types";
import { parseOrdersFilter } from "@/lib/orders-filter";
import { parseAvailableFilter } from "@/lib/available-filter";
import { parseCompanyOffersFilter, OFFER_STATUS_TABS, companyOffersHref } from "@/lib/offers-filter";
import { parseContractorsFilter } from "@/lib/contractors-filter";
import { parseDocumentsFilter, documentsHref } from "@/lib/documents-filter";
import { parseNotificationsFilter, notificationsHref } from "@/lib/notifications-filter";
import { toOrderOptions, withSelectedOrder } from "@/lib/document-view";

function useParams() { return Object.fromEntries(useSearchParams().entries()); }
export function DemoOrders({ mode }: { mode: "orders" | "available" | "offers" }) {
  const params = useParams();
  const { state, actorId } = useDemo();
  const actor = state?.users.find((u) => u.id === actorId);
  if (!state || !actor) return null;
  if (mode === "orders" && actor.role === Role.CLIENT) {
    const filter = parseOrdersFilter(params);
    return <>
      <PageHeader title="Все заказы" description="Создайте заказ и выберите исполнителя" action={<Button asChild><Link href="/orders/new/">Создать заказ</Link></Button>} />
      <OrdersStatusTabs filter={filter} />
      <ListSearch id="orders-search" basePath="/orders" params={{ status: filter.status }} value={filter.q} label="Поиск заказов" placeholder="Номер или название заказа" />
      <OrdersList filter={filter} page={selectOrders(state, actor.id, filter)} />
    </>;
  }
  if (actor.role !== Role.COMPANY) return <DeferredSection message="Этот раздел доступен профилю компании." />;
  if (mode === "offers") {
    const filter = parseCompanyOffersFilter(params);
    return <><PageHeader title="Мои предложения" description="Условия, выполнение и результаты ваших заказов" />
      <StatusTabs label="Статус предложения" tabs={[{ label: "Все предложения", href: companyOffersHref(), active: !filter.status },
        ...OFFER_STATUS_TABS.map((status) => ({ label: offerStatusLabels[status], href: companyOffersHref({ status }), active: filter.status === status }))]} />
      <CompanyOffersList filter={filter} page={selectOffers(state, actor.id, filter)} /></>;
  }
  const filter = parseAvailableFilter(params);
  return <><PageHeader title="Доступные заказы" description="Найдите проект и предложите свои условия" />
    <ListSearch id="available-search" basePath="/available" value={filter.q} label="Поиск заказов" placeholder="Номер или название заказа" />
    <AvailableOrdersList filter={filter} page={selectAvailable(state, actor.id, filter)} /></>;
}
export function DemoNewOrder() {
  const { state, actorId } = useDemo();
  if (state?.users.find((u) => u.id === actorId)?.role !== Role.CLIENT) return <DeferredSection message="Чтобы создать заказ, переключитесь на клиента." />;
  return <><PageHeader title="Новый заказ" description="Расскажите компаниям о вашем проекте" /><NewOrderForm /></>;
}
export function DemoOrderPage() {
  const params = useSearchParams();
  const { state, actorId } = useDemo();
  const order = state?.orders.find((o) => o.id === params.get("id"));
  if (!state || !actorId) return null;
  if (!order) return <DeferredSection message="Этот заказ отсутствует в вашем браузере. Он мог быть создан в другой копии демо или удалён при сбросе." />;
  return <OrderLive order={orderForViewer(order, actorId)} viewerId={actorId} />;
}
export function DemoContractors({ detail = false }: { detail?: boolean }) {
  const params = useParams();
  const { state } = useDemo();
  if (!state) return null;
  if (detail) {
    const contractor = contractors(state).find((c) => c.id === params.id);
    return contractor ? <ContractorProfile contractor={contractor} /> : <DeferredSection message="Компания не найдена в этой копии демо." />;
  }
  const filter = parseContractorsFilter(params);
  return <><PageHeader title="Подрядчики" description="Компании и выполненные ими заказы" />
    <ListSearch id="contractors-search" basePath="/contractors" value={filter.q} label="Поиск компаний" placeholder="Компания или город" />
    <ContractorsList filter={filter} page={selectContractors(state, filter)} /></>;
}
export function DemoDocuments() {
  const params = useParams();
  const { state, actorId } = useDemo();
  const actor = state?.users.find((u) => u.id === actorId);
  if (!state || !actor) return null;
  const filter = parseDocumentsFilter(params);
  // Seed identifiers are stable readable IDs, whereas new orders use UUIDs.
  filter.orderId = params.orderId || null;
  const options = withSelectedOrder(toOrderOptions(state.orders.filter((o) => isParty(o, actor.id))), filter.orderId);
  return <><PageHeader title="Документы" description="Файлы сохраняются только в этом браузере. До 10 МиБ на файл и 50 МиБ на все пользовательские файлы." />
    <StatusTabs label="Чьи файлы" tabs={[null, FileOwnerType.CLIENT, FileOwnerType.COMPANY].map((ownerType) => ({
      label: ownerType === null ? "Все документы" : ownerType === FileOwnerType.CLIENT ? "Задание клиента" : "Работа исполнителя",
      href: documentsHref({ ownerType, orderId: filter.orderId }), active: filter.ownerType === ownerType,
    }))} />
    <OrderSelect options={options} value={filter.orderId} ownerType={filter.ownerType} />
    <DocumentsList filter={filter} viewer={actor.role} page={selectDocuments(state, actor.id, filter)} /></>;
}
export function DemoNotifications() {
  const params = useParams();
  const { state, actorId } = useDemo();
  if (!state || !actorId) return null;
  const filter = parseNotificationsFilter(params);
  return <><PageHeader title="Уведомления" description="События в вашей копии демо" action={<MarkAllReadButton />} />
    <StatusTabs label="Уведомления" tabs={[{ label: "Все", href: notificationsHref(), active: !filter.unread },
      { label: "Непрочитанные", href: notificationsHref({ unread: true }), active: filter.unread }]} />
    <NotificationsList filter={filter} page={selectNotifications(state, actorId, filter)} /></>;
}
export function DemoSettings() {
  const { state, actorId } = useDemo();
  const actor = state?.users.find((u) => u.id === actorId);
  if (!actor) return null;
  return <><PageHeader title="Настройки" description="Изменения профиля видны только в вашей копии демо. Email и пароль здесь не меняются." />
    <ProfileForm profile={actor} /></>;
}
export function DeferredSection({ message = "Выберите демо-профиль, чтобы продолжить." }: { message?: string }) {
  return <Card><CardContent className="flex flex-col items-start gap-4 pt-6"><p>{message}</p><Button asChild variant="outline"><Link href="/login/">Выбрать профиль</Link></Button></CardContent></Card>;
}
