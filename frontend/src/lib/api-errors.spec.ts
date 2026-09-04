import { describe, expect, it } from "vitest";

import { ApiRequestError } from "./api";
import { apiErrorMessage, apiErrorMessages } from "./api-errors";

const FALLBACK = "Проверьте соединение и попробуйте ещё раз";

describe("apiErrorMessages", () => {
  it("не-ответ сети показывает запасным текстом", () => {
    expect(apiErrorMessages(new TypeError("fetch failed"), FALLBACK)).toEqual([FALLBACK]);
  });

  it("на 401 объясняет, что сессия истекла", () => {
    const error = new ApiRequestError(401, "Unauthorized", null);

    expect(apiErrorMessages(error, FALLBACK)).toEqual(["Сессия истекла. Войдите заново"]);
  });

  it("сообщения валидации отдаёт списком", () => {
    const error = new ApiRequestError(400, "…", {
      statusCode: 400,
      error: "Bad Request",
      message: ["Укажите цену", "Некорректный срок выполнения"],
    });

    expect(apiErrorMessages(error, FALLBACK)).toEqual([
      "Укажите цену",
      "Некорректный срок выполнения",
    ]);
  });

  it("причину отказа сервера показывает как есть", () => {
    // За 409 стоит настоящая причина, и она человеку нужнее общей фразы.
    const error = new ApiRequestError(409, "Заказ уже в работе", {
      statusCode: 409,
      error: "InvalidStateTransition",
      message: "Заказ уже в работе",
    });

    expect(apiErrorMessages(error, FALLBACK)).toEqual(["Заказ уже в работе"]);
  });
});

describe("apiErrorMessage", () => {
  it("склеивает несколько сообщений в одну строку", () => {
    const error = new ApiRequestError(400, "…", {
      statusCode: 400,
      error: "Bad Request",
      message: ["Укажите цену", "Укажите срок"],
    });

    expect(apiErrorMessage(error, FALLBACK)).toBe("Укажите цену. Укажите срок");
  });
});
