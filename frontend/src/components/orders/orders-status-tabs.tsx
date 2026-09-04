import { orderStatusLabels } from "@/lib/types";

import { StatusTabs } from "@/components/status-tabs";
import { ORDER_STATUS_TABS, ordersHref, type OrdersFilter } from "@/lib/orders-filter";

/** Вкладки статусов заказа (ТЗ §4.1). Поисковая строка при смене вкладки сохраняется. */
export function OrdersStatusTabs({ filter }: { filter: OrdersFilter }) {
  return (
    <StatusTabs
      label="Фильтр по статусу"
      tabs={[
        {
          label: "Все заказы",
          href: ordersHref({ q: filter.q }),
          active: filter.status === null,
        },
        ...ORDER_STATUS_TABS.map((status) => ({
          label: orderStatusLabels[status],
          href: ordersHref({ q: filter.q, status }),
          active: filter.status === status,
        })),
      ]}
    />
  );
}
