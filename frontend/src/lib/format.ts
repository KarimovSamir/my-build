/**
 * Форматирование значений для интерфейса: суммы, площади, размеры, даты.
 *
 * Даты приходят с сервера ISO-строками в UTC (`toISOString()`), и их два рода.
 * Календарная дата (срок, желаемая дата начала) хранится полуночью UTC и
 * читается строкой (`formatDate`): пересчёт в часовой пояс машины превратил бы
 * «25 декабря» у пользователя западнее Гринвича в 24-е. Момент времени
 * (`createdAt` и подобные) показывается по календарю Баку (`formatMoment`).
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

/**
 * Сумма в том виде, в каком её показывает интерфейс: «45 000 AZN» (ТЗ §7).
 *
 * Считается по строке, а не через `Number`: суммы приходят строками именно
 * затем, чтобы не проходить через число с плавающей точкой (`MoneyString`).
 * Прогонять их через `Number` ради форматирования — терять смысл типа.
 *
 * Неразрывный пробел (U+00A0) между разрядами — тот же, что ставит `Intl`
 * для русской локали: сумма не должна разрываться переносом строки.
 */
export function formatMoney(value: MoneyString): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());

  if (!match) return value;

  // Хвостовые нули не показываем: «150000.00» — это «150 000», а не «150 000,00».
  const fraction = (match[2] ?? "").slice(0, 2).replaceAll(/0+$/g, "");
  const whole = match[1]!.replaceAll(/\B(?=(\d{3})+(?!\d))/g, " ");

  return `${whole}${fraction ? `,${fraction}` : ""} AZN`;
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

/**
 * Организационно-правовые формы: по ним компанию не отличить.
 * «ООО «СтройГрад»» и «ООО «Ремонт Плюс»» дали бы в каталоге одинаковые «О».
 */
const legalForms = new Set(["ООО", "ОАО", "ЗАО", "ПАО", "АО", "ИП", "LLC", "LTD", "INC"]);

/**
 * Слова названия. Кавычки и знаки препинания в счёт не идут, иначе первой
 * буквой стала бы ««».
 */
function nameWords(name: string): string[] {
  return name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * Пустое имя сюда прийти не должно, но аватар без буквы выглядел бы поломкой
 * вёрстки — поэтому запасной знак вопроса.
 */
function firstLetter(word: string | undefined): string {
  return (word ?? "").charAt(0).toUpperCase() || "?";
}

/** Буква для аватара человека — первая буква имени, как оно написано. */
export function personInitial(name: string): string {
  return firstLetter(nameWords(name)[0]);
}

/**
 * Имя человека одной строкой. Фамилия необязательна — в базе колонка
 * `lastName` пустая у всех, кто её не указал.
 */
export function personName({
  firstName,
  lastName,
}: {
  firstName: string;
  lastName: string | null;
}): string {
  return [firstName, lastName].filter(Boolean).join(" ");
}

/**
 * Буква для аватара компании — первая буква значащего слова названия:
 * правовая форма пропускается.
 *
 * Правило намеренно отделено от `personInitial`: список ОПФ применительно
 * к ФИО означал бы, что имя, совпавшее с формой, покажет букву фамилии.
 *
 * Порядок каталога при этом алфавитный по полному названию — сортировать
 * по значащему слову базе нечем (`ORDER_BY` в `contractors.service.ts`).
 * Расхождение видно только на названиях с разной ОПФ и остаётся косметическим.
 */
export function companyInitial(name: string): string {
  const words = nameWords(name);

  // Название из одной правовой формы — случай надуманный, но буква нужна
  // и тогда: пусть будет её собственная.
  return firstLetter(words.find((word) => !legalForms.has(word.toUpperCase())) ?? words[0]);
}

/**
 * Город и страна одной строкой. `null` — места не указано вовсе: подпись
 * «Город не указан» выбирает уже компонент, у каталога и у карточки заказа
 * они разные.
 */
export function formatLocation({
  city,
  country,
}: {
  city: string | null;
  country: string | null;
}): string | null {
  const parts = [city, country].map((part) => part?.trim()).filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * Часовой пояс, в котором показываются моменты времени.
 *
 * Сервис работает в Азербайджане (адреса, телефоны, манаты), и «когда создан
 * заказ» для его пользователей — время Баку. Пояс задан явно, а не берётся
 * у машины: страницы рендерит сервер, у которого свой пояс (на Vercel — UTC),
 * и без этого сервер и браузер показывали бы разные числа. Пояс Баку — UTC+4
 * круглый год: без него всё, что случилось с полуночи до четырёх утра,
 * выглядело вчерашним.
 */
export const DISPLAY_TIME_ZONE = "Asia/Baku";

const momentParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Момент времени (`createdAt`, `updatedAt`, «сдана») в виде «25 дек 2025» —
 * по календарю Баку (`DISPLAY_TIME_ZONE`).
 *
 * Для календарных дат — срока, желаемой даты начала — это не годится: они
 * хранятся полуночью UTC, и сдвиг пояса там ни к чему. Для них `formatDate`.
 */
export function formatMoment(value: IsoDateString): string {
  const moment = new Date(value);

  if (Number.isNaN(moment.getTime())) return value;

  // `en-CA` отдаёт дату как «2025-12-25» — ровно то, что понимает `formatDate`.
  return formatDate(momentParts.format(moment));
}

/**
 * Календарная дата (срок, желаемая дата начала) в виде «25 дек 2025».
 * Моменты времени показывает `formatMoment`.
 */
export function formatDate(value: IsoDateString): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const monthName = match ? monthsShort[Number(match[2]) - 1] : undefined;

  if (!match || !monthName) return value;

  return `${Number(match[3])} ${monthName} ${match[1]}`;
}
