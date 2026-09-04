import { AuthError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { authErrorMessage } from "./auth-errors";

function authError(code: string, message = "Original english text"): AuthError {
  return new AuthError(message, 400, code);
}

describe("authErrorMessage", () => {
  it("переводит известные коды", () => {
    expect(authErrorMessage(authError("invalid_credentials"))).toBe(
      "Неверный email или пароль",
    );
    expect(authErrorMessage(authError("email_not_confirmed"))).toBe(
      "Подтвердите email — письмо со ссылкой уже отправлено",
    );
    expect(authErrorMessage(authError("weak_password"))).toBe(
      "Пароль слишком простой: нужно минимум 8 символов",
    );
  });

  it("оба кода про занятый email дают один текст", () => {
    expect(authErrorMessage(authError("user_already_exists"))).toBe(
      authErrorMessage(authError("email_exists")),
    );
  });

  it("ошибку триггера показывает как есть", () => {
    // Профиль создаёт триггер миграции, и текст там уже написан по-русски.
    expect(
      authErrorMessage(authError("unexpected_failure", "Не указано название компании")),
    ).toBe("Не указано название компании");
  });

  it("неизвестный код Supabase даёт общую формулировку", () => {
    expect(authErrorMessage(authError("teapot_error"))).toBe(
      "Не удалось выполнить запрос. Попробуйте ещё раз",
    );
  });

  it("ошибку без кода тоже не показывает по-английски", () => {
    expect(authErrorMessage(new AuthError("Something failed"))).toBe(
      "Не удалось выполнить запрос. Попробуйте ещё раз",
    );
  });

  it("обрыв сети и всё прочее — отдельный текст", () => {
    expect(authErrorMessage(new TypeError("fetch failed"))).toBe(
      "Что-то пошло не так. Проверьте соединение и попробуйте ещё раз",
    );
    expect(authErrorMessage("строка")).toBe(
      "Что-то пошло не так. Проверьте соединение и попробуйте ещё раз",
    );
  });
});
