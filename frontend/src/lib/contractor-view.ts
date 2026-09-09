/**
 * Как показывается компания в каталоге подрядчиков (ТЗ §7).
 *
 * Модуль чистый: ни React, ни fetch. Компоненты каталога только рисуют то,
 * что здесь собрано, — правила плюрализации и сборки ссылок на контакты
 * проверяются тестом, а не разглядыванием экрана.
 */

import type { ContractorCard } from "@/lib/types";

/** Всё, что нужно, чтобы назвать место: у обеих колонок в базе может не быть значения. */
type Place = Pick<ContractorCard, "city" | "country">;

/**
 * Город и страна одной строкой. `null` — места не указано вовсе: подписи
 * «Город не указан» решает уже компонент, у списка и карточки они разные.
 */
export function contractorLocation({ city, country }: Place): string | null {
  const parts = [city, country].map((part) => part?.trim()).filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * «3 завершённых заказа» — с русской плюрализацией.
 *
 * Ноль отдельным текстом: «0 завершённых заказов» читается как показатель,
 * хотя означает всего лишь «компания новая».
 */
export function completedOrdersText(count: number): string {
  if (count === 0) return "Пока нет завершённых заказов";

  return `${count} ${pluralizeOrders(count)}`;
}

/**
 * Форма «завершённый заказ» по числу.
 *
 * Второй десяток — исключение из общего правила: 11–14 идут с «заказов»,
 * хотя оканчиваются на 1–4.
 */
function pluralizeOrders(count: number): string {
  const tail = Math.abs(count) % 100;
  const last = tail % 10;

  if (tail >= 11 && tail <= 14) return "завершённых заказов";
  if (last === 1) return "завершённый заказ";
  if (last >= 2 && last <= 4) return "завершённых заказа";

  return "завершённых заказов";
}

export interface ContractorContact {
  label: string;
  /** Что показываем: адрес и номер в том виде, в каком их указала компания. */
  value: string;
  /** Куда ведёт ссылка. `null` — показать текстом: звонить или писать некуда. */
  href: string | null;
}

/**
 * Контакты компании со ссылками (ТЗ §7).
 *
 * Каталог для того и нужен, чтобы связаться с подрядчиком напрямую, — значит
 * почта и телефон должны нажиматься, а не выделяться мышью.
 */
export function contractorContacts({ email, phone }: ContractorCard): ContractorContact[] {
  return [
    { label: "Email", value: email, href: email ? `mailto:${email}` : null },
    { label: "Телефон", value: phone, href: telHref(phone) },
  ];
}

/**
 * Номер для `tel:` — только `+` и цифры.
 *
 * В базе телефон лежит как есть, вместе с пробелами, скобками и дефисами
 * (`PHONE_PATTERN`), а часть телефонных приложений на таком номере спотыкается.
 */
function telHref(phone: string): string | null {
  const digits = phone.replaceAll(/\D/g, "");

  if (digits === "") return null;

  return `tel:${phone.trimStart().startsWith("+") ? "+" : ""}${digits}`;
}
