import { AuthError } from "@supabase/supabase-js";

/**
 * Сообщения Supabase Auth по-русски (ТЗ §1: интерфейс на русском).
 *
 * Сопоставление идёт по коду ошибки, а не по тексту: текст в Supabase меняется
 * от версии к версии, код — нет.
 */
const messages: Record<string, string> = {
  invalid_credentials: "Неверный email или пароль",
  email_not_confirmed: "Подтвердите email — письмо со ссылкой уже отправлено",
  user_already_exists: "Пользователь с таким email уже зарегистрирован",
  email_exists: "Пользователь с таким email уже зарегистрирован",
  email_address_invalid: "Проверьте адрес электронной почты",
  weak_password: "Пароль слишком простой: нужно минимум 8 символов",
  same_password: "Новый пароль совпадает со старым",
  over_email_send_rate_limit:
    "Слишком много писем подряд. Подождите несколько минут и попробуйте снова",
  over_request_rate_limit: "Слишком много попыток. Подождите немного и попробуйте снова",
  signup_disabled: "Регистрация временно закрыта",
  session_expired: "Ссылка устарела. Запросите новую",
  otp_expired: "Ссылка устарела. Запросите новую",
  validation_failed: "Проверьте заполнение полей",
};

/** Понятный текст ошибки для формы. Неизвестный код — общая формулировка. */
export function authErrorMessage(error: unknown): string {
  if (error instanceof AuthError) {
    const known = error.code ? messages[error.code] : undefined;

    if (known) return known;

    // Профиль создаёт триггер, и его ошибки приезжают как ошибка базы:
    // текст на русском написан в самой миграции, поэтому показываем как есть.
    if (error.code === "unexpected_failure" && error.message) {
      return error.message;
    }

    return "Не удалось выполнить запрос. Попробуйте ещё раз";
  }

  return "Что-то пошло не так. Проверьте соединение и попробуйте ещё раз";
}
