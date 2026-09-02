import type { Role } from "@mybuild/shared";

/**
 * Временное представление текущего пользователя — часть, общая для сервера
 * и браузера. Ничего серверного здесь быть не должно: этот модуль тянут
 * и клиентские компоненты (`next/headers` в них не работает).
 *
 * В Фазе 2 всё это заменит реальная сессия Supabase. До тех пор каркас
 * кабинета должен что-то показывать, поэтому роль хранится в cookie,
 * которую переключает виджет в шапке (виден только в разработке).
 *
 * ВАЖНО: это не авторизация и никаких прав не даёт. Настоящие данные придут
 * из API только после проверки токена на backend'е.
 */
export const PREVIEW_ROLE_COOKIE = "mybuild_preview_role";

export interface CurrentUserPreview {
  role: Role;
  displayName: string;
  roleLabel: string;
  initial: string;
  city: string | null;
  country: string | null;
}

export function getPreviewUser(role: Role): CurrentUserPreview {
  if (role === "COMPANY") {
    return {
      role,
      displayName: "Название компании",
      roleLabel: "Компания",
      initial: "К",
      city: "Город",
      country: "Страна",
    };
  }

  return {
    role,
    displayName: "Имя",
    roleLabel: "Заказчик",
    initial: "И",
    city: "Город",
    country: "Страна",
  };
}

export function parseRole(value: string | undefined): Role {
  return value?.toUpperCase() === "COMPANY" ? "COMPANY" : "CLIENT";
}
