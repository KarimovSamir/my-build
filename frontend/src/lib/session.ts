import { Role, roleLabels, type UserProfile } from "@mybuild/shared";

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
  const displayName =
    profile.role === Role.COMPANY && profile.companyName
      ? profile.companyName
      : [profile.firstName, profile.lastName].filter(Boolean).join(" ");

  return {
    ...profile,
    displayName,
    roleLabel: roleLabels[profile.role],
    initial: displayName.trim().charAt(0).toUpperCase() || "?",
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
