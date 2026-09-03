import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { RolesGuard } from '../../common/guards/roles.guard.js';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard.js';
import { SupabaseJwtService } from './supabase-jwt.service.js';

/**
 * Аутентификация и авторизация (ТЗ §6).
 *
 * Собственных маршрутов у модуля нет: регистрацию, вход и сброс пароля ведёт
 * Supabase Auth, а backend только проверяет пришедший токен.
 *
 * Оба guard'а глобальные, и порядок регистрации — это порядок выполнения:
 * сначала проверяется подпись, потом роль. Значит, новый контроллер защищён
 * с момента появления, а не с момента, когда о защите вспомнили.
 */
@Global()
@Module({
  providers: [
    SupabaseJwtService,
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [SupabaseJwtService],
})
export class AuthModule {}
