/**
 * Правила нового пароля — одни на все три места, где его вводят:
 * регистрация, восстановление по ссылке из письма и смена в настройках
 * (ТЗ §5).
 *
 * Пароли проверяет и хранит Supabase Auth, backend о них не знает вовсе.
 * Здесь только то, что видит пользователь до отправки: длина, совпадение
 * с повтором и — в настройках — текущий пароль.
 *
 * Модуль чистый — ни React, ни fetch.
 */

/**
 * Минимальная длина. То же число стоит в настройках проекта Supabase:
 * разойдись они — форма пропустила бы пароль, который отклонит SDK.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** Поле, в котором ошибка, и текст для человека. */
export interface PasswordIssue {
  field: "password" | "passwordConfirm";
  message: string;
}

/**
 * Проверка нового пароля и его повтора. `null` — можно отправлять.
 *
 * Возвращает поле, а не только текст: формы авторизации показывают одну
 * ошибку над кнопкой, а настройки — под нужным полем. Правило при этом одно.
 */
export function validateNewPassword(
  password: string,
  passwordConfirm: string,
): PasswordIssue | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      field: "password",
      message: `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`,
    };
  }

  if (password !== passwordConfirm) {
    return { field: "passwordConfirm", message: "Пароли не совпадают" };
  }

  return null;
}

/** Значения формы смены пароля в настройках. */
export interface PasswordFormValues {
  currentPassword: string;
  password: string;
  passwordConfirm: string;
}

export type PasswordFormErrors = Partial<Record<keyof PasswordFormValues, string>>;

export const emptyPasswordForm: PasswordFormValues = {
  currentPassword: "",
  password: "",
  passwordConfirm: "",
};

/**
 * Проверка всей формы смены пароля. Пустой объект — можно отправлять.
 *
 * Совпадение нового пароля со старым Supabase отклонил бы и сам
 * (код `same_password`), но лишний круг к сети ради предсказуемого отказа
 * не нужен: ответ здесь тот же самый.
 */
export function validatePasswordForm(values: PasswordFormValues): PasswordFormErrors {
  const errors: PasswordFormErrors = {};

  if (!values.currentPassword) {
    errors.currentPassword = "Введите текущий пароль";
  }

  const issue = validateNewPassword(values.password, values.passwordConfirm);

  if (issue) {
    errors[issue.field] = issue.message;
  } else if (values.password === values.currentPassword) {
    errors.password = "Новый пароль совпадает с текущим";
  }

  return errors;
}
