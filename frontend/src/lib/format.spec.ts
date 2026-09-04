import { describe, expect, it } from "vitest";

import { formatArea, formatDate, formatFileSize, formatMoney } from "./format";

/** Неразрывный пробел — тот же, что ставит `Intl` для русской локали. */
const NBSP = " ";

describe("formatMoney", () => {
  it("отбрасывает хвостовые нули", () => {
    expect(formatMoney("150000.00")).toBe(`150${NBSP}000 USD`);
    expect(formatMoney("45000.50")).toBe(`45${NBSP}000,5 USD`);
  });

  it("показывает копейки, когда они есть", () => {
    expect(formatMoney("45000.55")).toBe(`45${NBSP}000,55 USD`);
  });

  it("не группирует числа короче тысячи", () => {
    expect(formatMoney("999")).toBe("999 USD");
    expect(formatMoney("0")).toBe("0 USD");
  });

  it("группирует разряды неразрывным пробелом", () => {
    expect(formatMoney("1234567.89")).toBe(`1${NBSP}234${NBSP}567,89 USD`);
  });

  it("считает по строке, не теряя точности на длинных суммах", () => {
    // Через `Number` последние разряды разъехались бы: сумма приходит строкой
    // (`MoneyString`) именно затем, чтобы этого не случилось.
    expect(formatMoney("9007199254740993.99")).toBe(
      `9${NBSP}007${NBSP}199${NBSP}254${NBSP}740${NBSP}993,99 USD`,
    );
  });

  it("непонятное значение показывает как есть", () => {
    expect(formatMoney("много")).toBe("много");
    expect(formatMoney("-100")).toBe("-100");
    expect(formatMoney("")).toBe("");
  });
});

describe("formatDate", () => {
  it("показывает календарную дату", () => {
    expect(formatDate("2025-12-25T00:00:00.000Z")).toBe("25 дек 2025");
    expect(formatDate("2026-01-01T12:30:00.000Z")).toBe("1 янв 2026");
  });

  it("полночь UTC не съезжает на предыдущий день", () => {
    // Разбор через `new Date(...).getDate()` дал бы 24 декабря западнее
    // Гринвича — ради этого дата и читается строкой.
    expect(formatDate("2025-12-25T00:00:00.000Z")).toContain("25 дек");
  });

  it("понимает дату без времени", () => {
    expect(formatDate("2026-09-04")).toBe("4 сен 2026");
  });

  it("непонятное значение показывает как есть", () => {
    expect(formatDate("завтра")).toBe("завтра");
    expect(formatDate("2026-13-01")).toBe("2026-13-01");
  });
});

describe("formatFileSize", () => {
  it("меньше килобайта показывает в байтах", () => {
    expect(formatFileSize(512)).toBe("512 Б");
    expect(formatFileSize(0)).toBe("0 Б");
  });

  it("килобайты округляет до целых", () => {
    expect(formatFileSize(2048)).toBe("2 КБ");
    expect(formatFileSize(1536)).toBe("2 КБ");
  });

  it("мегабайты показывает с одним знаком после запятой", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1 МБ");
    expect(formatFileSize(1.4 * 1024 * 1024)).toBe("1,4 МБ");
  });
});

describe("formatArea", () => {
  it("показывает площадь с запятой и единицей измерения", () => {
    expect(formatArea(62.5)).toBe("62,5 м²");
    expect(formatArea(100)).toBe("100 м²");
    expect(formatArea(1500)).toBe(`1${NBSP}500 м²`);
  });
});
