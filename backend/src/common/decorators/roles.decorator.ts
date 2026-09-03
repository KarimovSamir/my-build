import { SetMetadata } from '@nestjs/common';

import type { Role } from '@mybuild/shared';

export const ROLES_KEY = 'mybuild:roles';

/** Маршрут доступен только перечисленным ролям (ТЗ §6, RBAC). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
