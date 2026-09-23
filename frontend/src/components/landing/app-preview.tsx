import { Bell, FilePlus2, FileText, LayoutGrid, Users } from "lucide-react";

import { OrderStatusBadge } from "@/components/status-badge";
import { formatMoney } from "@/lib/format";
import { OrderStatus, type MoneyString, type OrderStatus as OrderStatusValue } from "@/lib/types";

/**
 * Витрина кабинета на лендинге — вёрстка, а не снимок экрана.
 *
 * Скриншот пришлось бы переснимать после каждой правки интерфейса и он бы
 * жил в единственной теме; здесь же список заказов рисуется теми же токенами
 * и тем же `OrderStatusBadge`, что и настоящий экран, поэтому расходиться
 * ему не с чем. Данные — из seed, чтобы обещание совпадало с демо.
 */

interface PreviewOrder {
  title: string;
  number: string;
  contractor: string | null;
  status: OrderStatusValue;
  amount: MoneyString;
  amountNote: string;
}

const orders: PreviewOrder[] = [
  {
    title: "Строительство частного дома",
    number: "ORD-2450",
    contractor: "ООО «СтройГрад»",
    status: OrderStatus.IN_PROGRESS,
    amount: "346800.00",
    amountNote: "цена сделки",
  },
  {
    title: "Проект перепланировки квартиры",
    number: "ORD-2451",
    contractor: "ООО «АрхПроект»",
    status: OrderStatus.AWAITING_COMPLETION_CONFIRMATION,
    amount: "4800.00",
    amountNote: "цена сделки",
  },
  {
    title: "Ремонт квартиры 100 м²",
    number: "ORD-2448",
    contractor: null,
    status: OrderStatus.WAITING,
    amount: "30600.00",
    amountNote: "бюджет клиента",
  },
  {
    title: "Дизайн-проект кухни",
    number: "ORD-2453",
    contractor: "ООО «СтройГрад»",
    status: OrderStatus.COMPLETED,
    amount: "2400.00",
    amountNote: "цена сделки",
  },
];

const sidebarItems = [
  { icon: FilePlus2, label: "Создать заказ" },
  { icon: Users, label: "Подрядчики" },
  { icon: FileText, label: "Документы" },
  { icon: Bell, label: "Уведомления", badge: "3" },
];

export function AppPreview() {
  return (
    <div
      className="border-border bg-card overflow-hidden rounded-xl border shadow-[0_24px_60px_rgba(34,28,23,0.10)] dark:shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
      aria-hidden
    >
      <div className="border-border bg-muted flex items-center gap-2 border-b px-4 py-3">
        <span className="bg-border size-2.5 rounded-full" />
        <span className="bg-border size-2.5 rounded-full" />
        <span className="bg-border size-2.5 rounded-full" />
        <span className="text-muted-foreground font-mono ml-3 text-xs">mybuild.app / orders</span>
      </div>

      <div className="grid lg:grid-cols-[228px_minmax(0,1fr)]">
        <div className="border-border bg-brand-surface hidden flex-col gap-0.5 border-r p-3.5 lg:flex">
          <div className="bg-accent text-accent-foreground flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm font-semibold">
            <LayoutGrid className="size-4" aria-hidden />
            Все заказы
          </div>
          {sidebarItems.map(({ icon: Icon, label, badge }) => (
            <div
              key={label}
              className="text-muted-foreground flex h-9 items-center gap-2.5 px-3 text-sm"
            >
              <Icon className="size-4" aria-hidden />
              {label}
              {badge ? (
                <span className="bg-primary text-primary-foreground font-mono ml-auto flex h-5 min-w-5 items-center justify-center rounded-md px-1.5 text-[0.6875rem]">
                  {badge}
                </span>
              ) : null}
            </div>
          ))}
        </div>

        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-heading text-xl font-semibold tracking-tight">Все заказы</p>
              <p className="text-muted-foreground mt-0.5 text-sm">
                Текущие и завершённые проекты
              </p>
            </div>
            <div className="bg-primary text-primary-foreground flex h-9 items-center rounded-lg px-4 text-sm font-semibold">
              + Создать заказ
            </div>
          </div>

          <div className="border-border mt-5 overflow-hidden rounded-lg border">
            <div className="text-muted-foreground bg-muted font-mono hidden grid-cols-[minmax(0,1fr)_150px_210px_140px] gap-4 px-4 py-2.5 text-[0.65rem] tracking-[0.12em] uppercase lg:grid">
              <span>Заказ</span>
              <span>Подрядчик</span>
              <span>Статус</span>
              <span className="text-right">Бюджет</span>
            </div>

            {orders.map((order) => (
              <div
                key={order.number}
                className="border-border grid grid-cols-1 gap-2 border-t px-4 py-3.5 first:border-t-0 lg:grid-cols-[minmax(0,1fr)_150px_210px_140px] lg:items-center lg:gap-4 lg:first:border-t"
              >
                <span>
                  <span className="block text-sm font-semibold">{order.title}</span>
                  <span className="text-muted-foreground font-mono mt-0.5 block text-xs">
                    {order.number}
                  </span>
                </span>
                <span className="text-muted-foreground text-sm lg:text-foreground">
                  {order.contractor ?? "Не назначен"}
                </span>
                <span>
                  <OrderStatusBadge status={order.status} className="text-xs" />
                </span>
                <span className="lg:text-right">
                  <span className="font-mono block text-sm font-medium whitespace-nowrap">
                    {formatMoney(order.amount)}
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    {order.amountNote}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
