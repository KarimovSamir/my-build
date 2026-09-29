import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import type { Role, UserProfile } from "@/lib/types";

import { serverApi } from "./api.server";
import { canChangePasswordNow } from "./password-form";
import {
  readDemoClaim,
  readEmailVerifiedClaim,
  readRoleClaim,
  readRecoveredAt,
  toCurrentUser,
  type CurrentUser,
} from "./session";
import { createSupabaseServerClient } from "./supabase/server";

/**
 * Сессия и профиль на сервере.
 *
 * Проверка идёт по проверенным claim'ам токена (`getClaims` сверяет подпись
 * по JWKS), а не по содержимому cookie: cookie можно подделать, подпись — нет.
 */

export interface SessionClaims {
  userId: string;
  email: string | null;
  /** Claim из Custom Access Token Hook: подтверждён ли адрес (ТЗ §6). */
  emailVerified: boolean;
  role: Role | null;
  /** Общая демо-учётка с экрана входа: пароль, email и профиль в ней не меняются. */
  isDemo: boolean;
  /**
   * Когда сессия пришла по ссылке восстановления пароля (мс). `null` — сессия
   * выдана не по ссылке из письма, и пароль без текущего ей не сменить.
   */
  recoveredAt: number | null;
}

/**
 * Claim'ы текущей сессии или null, если пользователь не вошёл.
 * `cache` — чтобы за один рендер страницы проверка выполнилась один раз.
 */
export const getSessionClaims = cache(async (): Promise<SessionClaims | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (typeof claims?.sub !== "string") {
    return null;
  }

  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    emailVerified: readEmailVerifiedClaim(claims.email_verified),
    role: readRoleClaim(claims.user_role),
    isDemo: readDemoClaim(claims.app_metadata),
    recoveredAt: readRecoveredAt(claims.amr),
  };
});

/**
 * Можно ли этой сессии задать новый пароль без текущего: она пришла по ссылке
 * восстановления, и окно ещё не закрылось (его же держит база —
 * `on_auth_user_password_reauth`).
 *
 * Время берётся здесь, а не в компоненте: серверный экран рендерится один раз
 * на запрос, а правило чистоты рендера у React Compiler этого не различает.
 */
export function canRecoverPasswordInSession(claims: SessionClaims): boolean {
  return canChangePasswordNow(claims.recoveredAt, Date.now());
}

/** Access-токен для запросов к нашему API. */
export const getAccessToken = cache(async (): Promise<string | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();

  return data.session?.access_token ?? null;
});

/**
 * Профиль текущего пользователя из API.
 *
 * Без сессии отправляет на вход: страницы кабинета без пользователя показывать
 * нечего. Настоящая проверка доступа всё равно на backend'е — здесь только UI.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const claims = await getSessionClaims();

  if (!claims) {
    redirect("/login");
  }

  const profile = await serverApi.get<UserProfile>("/profile");

  return toCurrentUser(profile);
});
