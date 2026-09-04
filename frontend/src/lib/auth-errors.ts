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

/**
 * Отказ триггера, создающего профиль.
 *
 * Триггер проверяет метаданные регистрации (роль, имя, телефон, длины полей)
 * и на неподходящие бросает исключение с русским текстом. До браузера этот
 * текст доезжает не всегда: на пути `signUp` GoTrue подменяет его общей
 * английской фразой и код ошибки не ставит вовсе.
 */
const TRIGGER_FAILURE = /database error (saving|creating) new user/i;

/** Понятный текст ошибки для формы. Неизвестный код — общая формулировка. */
export function authErrorMessage(error: unknown): string {
  if (error instanceof AuthError) {
    const known = error.code ? messages[error.code] : undefined;

    if (known) return known;

    if (TRIGGER_FAILURE.test(error.message)) {
      return "Проверьте данные профиля: имя, телефон или название компании не приняты";
    }

    // Текст триггера на русском написан в самой миграции — когда он всё-таки
    // доезжает, показываем как есть: точнее общей формулировки.
    if (error.code === "unexpected_failure" && error.message) {
      return error.message;
    }

    return "Не удалось выполнить запрос. Попробуйте ещё раз";
  }

  return "Что-то пошло не так. Проверьте соединение и попробуйте ещё раз";
}
