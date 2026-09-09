"use client";

import { useRouter } from "next/navigation";

import type { FileOwnerType } from "@/lib/types";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrderOption } from "@/lib/document-view";
import { documentsHref } from "@/lib/documents-filter";

/**
 * Фильтр «Заказ» в разделе «Документы» (ТЗ §7).
 *
 * Выборка уходит в адрес страницы, как и вкладки: фильтр обязан переживать
 * перезагрузку и кнопку «назад». Страница при смене заказа сбрасывается
 * на первую — остаться на третьей странице другой выборки почти всегда значит
 * увидеть пустой экран.
 *
 * Адрес компонент собирает сам: через границу клиентского компонента едут
 * только данные, функцию-сборщик серверная страница передать не может.
 */

/** Radix не принимает пустую строку значением пункта — «все» нужен свой ключ. */
const ALL_ORDERS = "all";

export function OrderSelect({
  options,
  value,
  ownerType,
}: {
  options: OrderOption[];
  /** Выбранный заказ или `null` — «все заказы». */
  value: string | null;
  /** Второй фильтр: при смене заказа он сохраняется. */
  ownerType: FileOwnerType | null;
}) {
  const router = useRouter();

  function handleChange(next: string) {
    router.replace(
      documentsHref({ ownerType, orderId: next === ALL_ORDERS ? null : next }),
      { scroll: false },
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:max-w-sm">
      <Label htmlFor="documents-order">Заказ</Label>

      {/* `name` нужен скрытому полю, которое рендерит Radix: без имени
          браузер помечает его как ошибку разметки. */}
      <Select name="orderId" value={value ?? ALL_ORDERS} onValueChange={handleChange}>
        <SelectTrigger id="documents-order" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_ORDERS}>Все заказы</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
