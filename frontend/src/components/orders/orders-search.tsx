"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { ordersHref, type OrdersFilter } from "@/lib/orders-filter";

/**
 * Поиск по списку заказов (ТЗ §4.1: номер, название, подрядчик).
 *
 * Строка запроса уходит в адрес страницы — с задержкой, чтобы каждая набранная
 * буква не превращалась в запрос к API. Смена запроса всегда возвращает на
 * первую страницу: остаться на пятой странице другой выборки — почти всегда
 * пустой экран.
 */

const DEBOUNCE_MS = 350;

export function OrdersSearch({ filter }: { filter: OrdersFilter }) {
  const router = useRouter();
  const [value, setValue] = useState(filter.q);

  // Что мы сами в последний раз положили в адрес. Нужно, чтобы отличить
  // «адрес изменился снаружи» (сброс фильтров, кнопка «назад») от эха
  // собственного перехода — иначе поле затирало бы то, что человек печатает.
  const pushed = useRef(filter.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (filter.q !== pushed.current) {
      pushed.current = filter.q;
      setValue(filter.q);
    }
  }, [filter.q]);

  useEffect(() => () => clearTimer(timer), []);

  function handleChange(next: string) {
    setValue(next);
    clearTimer(timer);

    timer.current = setTimeout(() => {
      pushed.current = next.trim();
      router.replace(ordersHref({ status: filter.status, q: pushed.current }), {
        scroll: false,
      });
    }, DEBOUNCE_MS);
  }

  return (
    <div className="relative w-full sm:max-w-sm">
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        aria-label="Поиск заказов"
        placeholder="Поиск по номеру, названию или подрядчику"
        className="h-10 pl-9"
      />
    </div>
  );
}

function clearTimer(timer: { current: ReturnType<typeof setTimeout> | null }) {
  if (timer.current) {
    clearTimeout(timer.current);
    timer.current = null;
  }
}
