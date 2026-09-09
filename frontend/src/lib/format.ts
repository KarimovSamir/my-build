/**
 * Форматирование значений для интерфейса: суммы, площади, размеры, даты.
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

/**
 * Сумма в том виде, в каком её показывает интерфейс: «45 000 USD» (ТЗ §7).
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

  return `${whole}${fraction ? `,${fraction}` : ""} USD`;
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

/** Дата в виде «25 дек 2025». */
export function formatDate(value: IsoDateString): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const monthName = match ? monthsShort[Number(match[2]) - 1] : undefined;

  if (!match || !monthName) return value;

  return `${Number(match[3])} ${monthName} ${match[1]}`;
}
