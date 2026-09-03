import { getHomeHref } from "./navigation";
import { readRoleClaim } from "./session";
import { getSupabaseBrowserClient } from "./supabase/client";

/**
 * Куда вести пользователя сразу после входа или смены пароля.
 *
 * Если он шёл на конкретную страницу — возвращаем туда. Иначе сразу в кабинет
 * по роли, а не на лендинг: лендинг всё равно перенаправит, но лишний переход
 * успевает мигнуть пустым экраном.
 *
 * Роль берётся из свежего токена, подпись которого проверена по JWKS.
 */
export async function resolveAfterAuthHref(next = "/"): Promise<string> {
  if (next !== "/") {
    return next;
  }

  const { data } = await getSupabaseBrowserClient().auth.getClaims();

  return getHomeHref(readRoleClaim(data?.claims?.user_role));
}
