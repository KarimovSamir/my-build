import { Role, roleLabels, type UserProfile } from "@/lib/types";

import { companyInitial, personInitial, personName } from "./format";

/**
 * Текущий пользователь в том виде, в каком его показывает интерфейс.
 *
 * Это профиль из нашего API плюс несколько производных полей, чтобы шапка
 * и боковое меню не считали одно и то же по-разному.
 *
 * Здесь не должно быть ничего серверного: файл тянут и клиентские компоненты.
 */
export interface CurrentUser extends UserProfile {
  /** Компанию узнают по названию, клиента — по имени. */
  displayName: string;
  roleLabel: string;
  /** Буква для аватара. */
  initial: string;
}

export function toCurrentUser(profile: UserProfile): CurrentUser {
  const byCompanyName = profile.role === Role.COMPANY && Boolean(profile.companyName);

  const displayName = byCompanyName ? profile.companyName! : personName(profile);

  return {
    ...profile,
    displayName,
    roleLabel: roleLabels[profile.role],
    // Буква считается по тому, что показано: у названия компании правовая форма
    // пропускается, у имени человека — нет.
    initial: byCompanyName ? companyInitial(displayName) : personInitial(displayName),
  };
}

/**
 * Роль из claim'а `user_role` (ТЗ §6).
 *
 * Хук Supabase может быть не включён или вернуть неожиданное значение —
 * тогда роли нет. Проверять её надо всё равно на backend'е: здесь она нужна
 * только чтобы не показать компании клиентские разделы.
 */
export function readRoleClaim(claim: unknown): Role | null {
  return claim === Role.CLIENT || claim === Role.COMPANY ? claim : null;
}

/**
 * Подтверждён ли email — claim `email_verified` из того же хука (ТЗ §6).
 *
 * Хук берёт значение из `auth.users.email_confirmed_at`, поэтому подделать его
 * нельзя. Claim'а нет — считаем подтверждённым: значит, хук в проекте выключен,
 * и тогда нет и роли, а без роли кабинет всё равно закрыт. Так же рассуждает
 * backend (`supabase-jwt.service.ts`), и расходиться эти две проверки не должны.
 */
export function readEmailVerifiedClaim(claim: unknown): boolean {
  return claim !== false;
}

/**
 * Способ входа по ссылке подтверждения регистрации через PKCE
 * (`models.EmailSignup` в GoTrue, internal/models/factor.go).
 */
const SIGNUP_AMR_METHOD = "email/signup";

/**
 * Способы входа, которыми приходит сессия по ссылке из письма, где пароль
 * задаётся без текущего: восстановление и подтверждение регистрации.
 *
 * GoTrue пишет в `amr` способ входа и время. Одноразовый `token_hash`
 * даёт `otp` (проверено на живом проекте), ссылки из наших форм идут через
 * PKCE и дают `recovery` («Забыли пароль») или `email/signup` (регистрация).
 * Подтверждение регистрации стоит здесь, потому что пароля у учётки после
 * него нет вовсе: база стирает тот, что задали до подтверждения (триггер
 * `on_auth_user_signup_confirmed`, защита от захвата адреса заранее).
 * Вход паролем — `password`, и его здесь нет намеренно.
 */
const RECOVERY_AMR_METHODS: readonly string[] = ["recovery", "otp", SIGNUP_AMR_METHOD];

/**
 * Пришла ли сессия по ссылке подтверждения регистрации. После неё у учётки
 * нет пароля, и `/callback` ведёт прямо на форму его установки.
 */
export function isSignupConfirmation(amr: unknown): boolean {
  return (
    Array.isArray(amr) &&
    amr.some((entry) => (entry as { method?: unknown } | null)?.method === SIGNUP_AMR_METHOD)
  );
}

/**
 * Когда сессия пришла по ссылке из письма (восстановление или подтверждение
 * регистрации) — самая поздняя такая отметка `amr`, в миллисекундах.
 * `null` — сессия выдана не по ссылке из письма.
 *
 * Именно по ней `/reset-password` решает, показывать ли форму нового пароля
 * без текущего. По времени входа вообще (как раньше) форма открывалась и
 * вошедшему паролем — в течение 15 минут любая живая сессия меняла пароль,
 * не зная текущего, в обход проверки в настройках. Продление токена отметку
 * не меняет.
 */
export function readRecoveredAt(amr: unknown): number | null {
  if (!Array.isArray(amr)) return null;

  let latest: number | null = null;

  for (const entry of amr) {
    const { method, timestamp } = (entry ?? {}) as { method?: unknown; timestamp?: unknown };

    if (
      typeof method === "string" &&
      RECOVERY_AMR_METHODS.includes(method) &&
      typeof timestamp === "number" &&
      Number.isFinite(timestamp)
    ) {
      latest = Math.max(latest ?? timestamp, timestamp);
    }
  }

  return latest === null ? null : latest * 1000;
}

/**
 * Общая демо-учётка с экрана входа — `app_metadata.demo` в токене.
 *
 * Флаг ставит seed ключом сервера; сам пользователь `app_metadata` не меняет.
 * Интерфейсу он нужен, чтобы не предлагать того, что демо запрещено: пароль
 * и email запрещает менять база, профиль — backend.
 */
export function readDemoClaim(appMetadata: unknown): boolean {
  return (
    typeof appMetadata === "object" &&
    appMetadata !== null &&
    (appMetadata as { demo?: unknown }).demo === true
  );
}
