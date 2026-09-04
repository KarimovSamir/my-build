"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { listHref } from "@/lib/list-params";

/**
 * Поиск по списку: заказы клиента (ТЗ §4.1) и лента компании ищут одинаково.
 *
 * Строка запроса уходит в адрес страницы — с задержкой, чтобы каждая набранная
 * буква не превращалась в запрос к API. Смена запроса всегда возвращает на
 * первую страницу: остаться на пятой странице другой выборки — почти всегда
 * пустой экран.
 *
 * Адрес компонент собирает сам, из пути раздела и остальных параметров
 * фильтра: функцию-сборщик серверная страница передать не может — через
 * границу клиентского компонента едут только данные.
 */

const DEBOUNCE_MS = 350;

export function ListSearch({
  id,
  basePath,
  params,
  value: current,
  label,
  placeholder,
}: {
  id: string;
  /** Путь раздела: `/orders`, `/available`. */
  basePath: string;
  /** Остальные параметры фильтра, кроме страницы: она сбрасывается. */
  params?: Record<string, string | null | undefined>;
  value: string;
  label: string;
  placeholder: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(current);

  // Что мы сами в последний раз положили в адрес. Нужно, чтобы отличить
  // «адрес изменился снаружи» (сброс фильтров, кнопка «назад») от эха
  // собственного перехода — иначе поле затирало бы то, что человек печатает.
  const pushed = useRef(current);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (current !== pushed.current) {
      pushed.current = current;
      setValue(current);
    }
  }, [current]);

  useEffect(() => () => clearTimer(timer), []);

  function handleChange(next: string) {
    setValue(next);
    clearTimer(timer);

    timer.current = setTimeout(() => {
      pushed.current = next.trim();
      router.replace(listHref(basePath, { ...params, q: pushed.current }), {
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
        // Поле без id и name Chrome помечает замечанием к разметке формы,
        // хотя формы вокруг него нет. Дешевле дать имя, чем объяснять запись
        // в консоли каждому, кто откроет вкладку Issues.
        id={id}
        name="q"
        type="search"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        aria-label={label}
        placeholder={placeholder}
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
