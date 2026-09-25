import { describe, expect, it } from "vitest";

import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_CHANGE_WINDOW_MINUTES,
  canChangePasswordNow,
  emptyPasswordForm,
  validateNewPassword,
  validatePasswordForm,
} from "./password-form";

/**
 * Правило нового пароля одно на регистрацию, восстановление и настройки:
 * разойдись они — одна форма принимала бы то, что другая отклоняет, хотя
 * пароль хранит один и тот же Supabase Auth.
 */

const strong = "новый-пароль-2026";

describe("validateNewPassword", () => {
  it("подходящий пароль с совпадающим повтором ошибок не даёт", () => {
    expect(validateNewPassword(strong, strong)).toBeNull();
  });

  it("короткий пароль отмечается в самом поле пароля", () => {
    const issue = validateNewPassword("1".repeat(MIN_PASSWORD_LENGTH - 1), "1");

    expect(issue).toEqual({
      field: "password",
      message: `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`,
    });
  });

  it("ровно минимальная длина уже годится", () => {
    const minimal = "1".repeat(MIN_PASSWORD_LENGTH);

    expect(validateNewPassword(minimal, minimal)).toBeNull();
  });

  it("несовпадение отмечается в поле повтора", () => {
    expect(validateNewPassword(strong, `${strong} `)).toEqual({
      field: "passwordConfirm",
      message: "Пароли не совпадают",
    });
  });
});

describe("validatePasswordForm", () => {
  it("пустая форма требует все три поля", () => {
    const errors = validatePasswordForm(emptyPasswordForm);

    expect(errors.currentPassword).toBe("Введите текущий пароль");
    expect(errors.password).toContain("не короче");
  });

  it("заполненная форма проходит", () => {
    expect(
      validatePasswordForm({
        currentPassword: "MyBuild-seed-2026",
        password: strong,
        passwordConfirm: strong,
      }),
    ).toEqual({});
  });

  it("новый пароль, равный текущему, не отправляется: Supabase отклонит его сам", () => {
    expect(
      validatePasswordForm({
        currentPassword: strong,
        password: strong,
        passwordConfirm: strong,
      }).password,
    ).toBe("Новый пароль совпадает с текущим");
  });
});

describe("canChangePasswordNow", () => {
  // Окно держит база (триггер on_auth_user_password_reauth); экран лишь
  // не показывает форму, которую она уже не примет.
  const window = PASSWORD_CHANGE_WINDOW_MINUTES * 60_000;
  const now = 1_790_000_000_000;

  it("сразу после входа — можно", () => {
    expect(canChangePasswordNow(now - 1_000, now)).toBe(true);
    expect(canChangePasswordNow(now - window + 1_000, now)).toBe(true);
  });

  it("вход старше окна — нельзя", () => {
    expect(canChangePasswordNow(now - window, now)).toBe(false);
    expect(canChangePasswordNow(now - 24 * 60 * 60_000, now)).toBe(false);
  });

  it("время входа неизвестно — нельзя", () => {
    expect(canChangePasswordNow(null, now)).toBe(false);
  });
});
