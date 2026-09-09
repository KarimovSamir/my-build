import { describe, expect, it } from "vitest";

import {
  MIN_PASSWORD_LENGTH,
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
