/**
 * Форматирование чисел и дат для интерфейса.
 *
 * Даты приходят с сервера ISO-строками в UTC (`toISOString()`), и разбираются
 * здесь как календарная дата, а не как момент времени: `Intl` и `Date`
 * пересчитали бы её в часовой пояс машины, и «25 декабря» у пользователя
 * западнее Гринвича превратилось бы в 24-е.
 */

import type { IsoDateString, MoneyString } from "@/lib/types";

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

/** Площадь в виде «62,5 м²». */
export function formatArea(squareMeters: number): string {
  return `${amountFormatter.format(squareMeters)} м²`;
}

/** Размер файла в том виде, в каком его показывает список: «1,4 МБ». */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${Math.round(kilobytes)} КБ`;

  return `${(kilobytes / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
}

/** Дата в виде «25 дек 2025». */
export function formatDate(value: IsoDateString): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const monthName = match ? monthsShort[Number(match[2]) - 1] : undefined;

  if (!match || !monthName) return value;

  return `${Number(match[3])} ${monthName} ${match[1]}`;
}
