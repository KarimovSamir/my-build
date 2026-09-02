import "server-only";

import { cookies } from "next/headers";

import type { Role } from "@mybuild/shared";

import { PREVIEW_ROLE_COOKIE, parseRole } from "./session";

/**
 * Серверная часть временной сессии: чтение роли из cookie.
 *
 * Отделено от `session.ts`, потому что `next/headers` доступен только
 * в серверных компонентах, а константы и типы нужны и в браузере.
 * В Фазе 2 этот файл заменит чтение сессии Supabase.
 */
export async function getPreviewRole(): Promise<Role> {
  const store = await cookies();
  return parseRole(store.get(PREVIEW_ROLE_COOKIE)?.value);
}
