import type { Request } from 'express';

import type { Role } from '@mybuild/shared';

/**
 * Пользователь, установленный `SupabaseAuthGuard` из проверенного JWT.
 *
 * Здесь только то, что реально лежит в подписанном токене. Всё остальное —
 * имя, телефон, город — читается из базы, потому что токен живёт час и данные
 * в нём успевают устареть.
 */
export interface AuthUser {
  /** `sub` токена, он же `auth.users.id`, он же `public."User".id`. */
  id: string;
  email: string | null;
  /**
   * Claim `email_verified` из того же хука: он читает `auth.users.email_confirmed_at`,
   * то есть значение подписано Supabase и подделать его нельзя (ТЗ §6).
   */
  emailVerified: boolean;
  /**
   * Claim `user_role` из Custom Access Token Hook (ТЗ §6).
   * `null`, если хук не включён в проекте Supabase, — тогда `RolesGuard`
   * не пропустит запрос и скажет, чего не хватает.
   */
  role: Role | null;
}

/** Запрос с уже проверенным токеном. */
export interface RequestWithUser extends Request {
  user?: AuthUser;
}
