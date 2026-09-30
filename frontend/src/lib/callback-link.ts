/**
 * Разбор ссылки из письма, которая приносит вход без PKCE: токены во фрагменте
 * (`#access_token=…`) или одноразовый `?token_hash=`.
 *
 * Такие ссылки входят под тем, чьи токены в них лежат, — а подсунуть их можно
 * чужому браузеру: злоумышленник берёт ссылку из письма на свою почту, жертва
 * по ней переходит и незаметно оказывается в его учётной записи (login-CSRF).
 * Всё, что она дальше введёт, — адрес, телефон, файлы — достанется ему.
 * Поэтому вход по такой ссылке не происходит сам: `/callback/complete`
 * показывает, чья учётная запись откроется, и ждёт кнопки. Ссылки `?code=`
 * это не касается — без verifier из браузера, запросившего письмо, обмен
 * кода не проходит.
 *
 * Модуль чистый — ни React, ни Supabase.
 */

import type { EmailOtpType } from "@supabase/supabase-js";

/** Что принесла ссылка. `null` — ничего узнаваемого, ссылка битая. */
export type CallbackLink =
  | {
      kind: "session";
      accessToken: string;
      refreshToken: string;
      /** Почта из токена — только чтобы показать её человеку. */
      email: string | null;
    }
  | { kind: "otp"; tokenHash: string; type: EmailOtpType };

const OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

function isOtpType(value: string): value is EmailOtpType {
  return (OTP_TYPES as readonly string[]).includes(value);
}

/**
 * Почта из access-токена без проверки подписи.
 *
 * Проверять здесь нечего и незачем: значение только показывается человеку,
 * а сессию из этих токенов всё равно проверит Supabase при `setSession`.
 */
export function readTokenEmail(accessToken: string): string | null {
  const payload = accessToken.split(".")[1];
  if (!payload) return null;

  try {
    const json = atob(payload.replaceAll("-", "+").replaceAll("_", "/"));
    const claims: unknown = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(json, (char) => char.charCodeAt(0))),
    );
    const email = (claims as { email?: unknown } | null)?.email;

    return typeof email === "string" && email.length > 0 ? email : null;
  } catch {
    return null;
  }
}

/** Разобрать ссылку: фрагмент (`#…` без решётки) и параметры запроса. */
export function parseCallbackLink(hash: string, search: URLSearchParams): CallbackLink | null {
  const tokenHash = search.get("token_hash");
  const type = search.get("type");

  if (tokenHash && type && isOtpType(type)) {
    return { kind: "otp", tokenHash, type };
  }

  const fragment = new URLSearchParams(hash);
  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");

  if (accessToken && refreshToken) {
    return { kind: "session", accessToken, refreshToken, email: readTokenEmail(accessToken) };
  }

  return null;
}

/** Экран, где задаётся пароль без текущего: по ссылке восстановления и после регистрации. */
export const SET_PASSWORD_PATH = "/reset-password";

/**
 * Куда вести после входа по ссылке из письма.
 *
 * Подтверждение регистрации оставляет учётку без пароля: база стирает тот,
 * что задали до подтверждения (`on_auth_user_signup_confirmed` — иначе
 * адрес можно было занять заранее со своим паролем). Поэтому такая ссылка
 * ведёт прямо на форму пароля, куда бы ни указывал `next`. Признак — тип
 * одноразовой ссылки или способ входа `email/signup` в токене после обмена
 * кода (`isSignupConfirmation` в `lib/session.ts`).
 */
export function landingAfterLink(
  link: { signupConfirmation: boolean },
  next: string,
): string {
  return link.signupConfirmation ? SET_PASSWORD_PATH : next;
}

/** Ссылка — подтверждение регистрации одноразовым `token_hash`. */
export function isSignupLink(link: CallbackLink): boolean {
  return link.kind === "otp" && link.type === "signup";
}

/** Что сделает ссылка — для текста экрана подтверждения. */
export function callbackPurpose(link: CallbackLink): string {
  if (link.kind === "session") {
    return link.email
      ? `Ссылка откроет учётную запись ${link.email}.`
      : "Ссылка откроет учётную запись, для которой было отправлено письмо.";
  }

  switch (link.type) {
    case "signup":
      return "Ссылка подтвердит адрес почты, после чего вы зададите пароль для входа.";
    case "recovery":
      return "Ссылка откроет вашу учётную запись, чтобы задать новый пароль.";
    case "email_change":
      return "Ссылка подтвердит новый адрес почты и откроет учётную запись.";
    default:
      return "Ссылка подтвердит адрес почты и откроет учётную запись.";
  }
}
