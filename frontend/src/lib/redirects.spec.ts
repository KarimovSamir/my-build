import { describe, expect, it } from "vitest";

import { safeNextPath } from "./redirects";

/**
 * Защита от open redirect: адрес возврата приходит строкой запроса, то есть
 * от кого угодно. Пропускать можно только пути внутри приложения.
 */
describe("safeNextPath", () => {
  it("пропускает относительный путь вместе со строкой запроса", () => {
    expect(safeNextPath("/orders?status=WAITING&page=2")).toBe(
      "/orders?status=WAITING&page=2",
    );
  });

  it("без значения отдаёт запасной адрес", () => {
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });

  it("не пропускает абсолютный адрес чужого сайта", () => {
    expect(safeNextPath("https://зло.example/orders")).toBe("/");
    expect(safeNextPath("http://зло.example")).toBe("/");
  });

  it("не пропускает протокол-относительный адрес", () => {
    // `//host` браузер считает адресом другого сайта.
    expect(safeNextPath("//зло.example/orders")).toBe("/");
  });

  it("не пропускает обратную косую после первой", () => {
    // Часть браузеров читает `/\host` так же, как `//host`.
    expect(safeNextPath("/\\зло.example")).toBe("/");
  });

  /**
   * Разбор адреса выбрасывает табуляцию и переводы строки из любого места
   * строки, а пробелы — по краям. Значит, проверять надо результат этой чистки:
   * иначе `/{таб}/host` проходит фильтр как относительный путь, а браузер
   * видит уже `//host`.
   */
  describe("символы, которые вырезает сам разбор адреса", () => {
    it.each([
      ["табуляция", "/\t/зло.example"],
      ["перевод строки", "/\n/зло.example"],
      ["возврат каретки", "/\r/зло.example"],
      ["несколько подряд", "/\t\r\n/зло.example"],
    ])("не пропускает протокол-относительный адрес, спрятанный за %s", (_case, path) => {
      expect(safeNextPath(path)).toBe("/");

      // То же самое, но глазами браузера: без чистки фильтр смотрел бы
      // на один адрес, а переход шёл бы по другому. Хост сравниваем через
      // такой же разбор — иначе тест сверял бы кириллицу с punycode.
      const outsider = new URL("http://зло.example").host;
      expect(new URL(path, "http://app.local/login").host).toBe(outsider);
    });

    it.each(["  //зло.example", "\t//зло.example", " https://зло.example"])(
      "не пропускает адрес с пробелами в начале: %j",
      (path) => {
        expect(safeNextPath(path)).toBe("/");
      },
    );

    it("отдаёт путь уже без вырезаемых символов, а не как пришло", () => {
      // Вернуть исходную строку значило бы проверить одно, а отдать другое.
      expect(safeNextPath("/or\tders?status=WAITING")).toBe("/orders?status=WAITING");
      expect(safeNextPath("  /orders  ")).toBe("/orders");
    });

    it("обычный путь чистка не портит", () => {
      expect(safeNextPath("/orders/new")).toBe("/orders/new");
      expect(safeNextPath("/orders?q=%D0%BF%D0%BB%D0%B0%D0%BD")).toBe(
        "/orders?q=%D0%BF%D0%BB%D0%B0%D0%BD",
      );
    });
  });

  it("из повторяющегося параметра берёт первое значение и проверяет его", () => {
    expect(safeNextPath(["/documents", "https://зло.example"])).toBe("/documents");
    expect(safeNextPath(["https://зло.example", "/documents"])).toBe("/");
  });

  it("возвращает заданный запасной адрес, а не корень", () => {
    expect(safeNextPath("https://зло.example", "/orders")).toBe("/orders");
  });
});
