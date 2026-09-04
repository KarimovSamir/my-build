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

  it("из повторяющегося параметра берёт первое значение и проверяет его", () => {
    expect(safeNextPath(["/documents", "https://зло.example"])).toBe("/documents");
    expect(safeNextPath(["https://зло.example", "/documents"])).toBe("/");
  });

  it("возвращает заданный запасной адрес, а не корень", () => {
    expect(safeNextPath("https://зло.example", "/orders")).toBe("/orders");
  });
});
