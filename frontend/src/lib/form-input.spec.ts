import { afterEach, describe, expect, it, vi } from "vitest";

import { isCalendarDate, isPastDate, normalizeNumber, todayIsoDate } from "./form-input";

afterEach(() => {
  vi.useRealTimers();
});

describe("normalizeNumber", () => {
  it("превращает запятую в точку и убирает пробелы по краям", () => {
    expect(normalizeNumber("  62,5 ")).toBe("62.5");
  });

  it("заменяет все запятые, а не первую", () => {
    // Иначе «1,234,5» стало бы «1.234,5», и сообщение про формат объясняло бы
    // не ту причину, по которой строка не прошла.
    expect(normalizeNumber("1,234,5")).toBe("1.234.5");
  });
});

describe("todayIsoDate", () => {
  it("считает день по UTC, а не по часовому поясу браузера", () => {
    // Тот же день, с которым сравнивает backend: разойдись они — календарь
    // предлагал бы дату, которую сервер отклонит.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T23:30:00.000Z"));

    expect(todayIsoDate()).toBe("2026-09-04");
  });
});

describe("isCalendarDate", () => {
  it("принимает только запись вида ГГГГ-ММ-ДД", () => {
    expect(isCalendarDate("2026-09-04")).toBe(true);
    expect(isCalendarDate("04.09.2026")).toBe(false);
    expect(isCalendarDate("2026-09-04T00:00:00.000Z")).toBe(false);
    expect(isCalendarDate("")).toBe(false);
  });
});

describe("isPastDate", () => {
  it("сегодняшний день прошлым не считает", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T12:00:00.000Z"));

    expect(isPastDate("2026-09-03")).toBe(true);
    expect(isPastDate("2026-09-04")).toBe(false);
    expect(isPastDate("2026-09-05")).toBe(false);
  });
});
