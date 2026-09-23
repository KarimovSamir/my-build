/**
 * Русская плюрализация: «1 компания», «2 компании», «5 компаний».
 *
 * Одна функция на весь фронт: правило выбора формы одинаковое у заказов,
 * компаний и файлов, а вторая его копия разошлась бы молча — на экране это
 * видно только на числах вроде 11 и 21.
 *
 * Модуль чистый: ни React, ни fetch.
 */

/** Три формы слова: для 1, для 2–4 и для 5 и больше. */
export type PluralForms = readonly [one: string, few: string, many: string];

export function pluralRu(count: number, [one, few, many]: PluralForms): string {
  const tail = Math.abs(count) % 100;
  const last = tail % 10;

  // Второй десяток — исключение из общего правила: 11–14 идут с формой «много»,
  // хотя оканчиваются на 1–4.
  if (tail >= 11 && tail <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;

  return many;
}
