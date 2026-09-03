/**
 * Форматирование чисел и дат для интерфейса.
 *
 * Даты приходят с сервера ISO-строками в UTC (`toISOString()`), и разбираются
 * здесь как календарная дата, а не как момент времени: `Intl` и `Date`
 * пересчитали бы её в часовой пояс машины, и «25 декабря» у пользователя
 * западнее Гринвича превратилось бы в 24-е.
 */

import type { IsoDateString, MoneyString } from "@mybuild/shared";

const monthsShort = [
  "янв",
  "фев",
  "мар",
  "апр",
  "мая",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

const amountFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

/** Сумма в том виде, в каком её показывает интерфейс: «45 000 USD» (ТЗ §7). */
export function formatMoney(value: MoneyString): string {
  const amount = Number(value);

  return Number.isFinite(amount) ? `${amountFormatter.format(amount)} USD` : value;
}

/** Дата в виде «25 дек 2025». */
export function formatDate(value: IsoDateString): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const monthName = match ? monthsShort[Number(match[2]) - 1] : undefined;

  if (!match || !monthName) return value;

  return `${Number(match[3])} ${monthName} ${match[1]}`;
}
