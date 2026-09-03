import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseAdminClient } from './supabase-admin.js';

/** Токен клиента Supabase с секретным ключом. */
export const SUPABASE_ADMIN = Symbol('SUPABASE_ADMIN');

/**
 * Клиент Supabase как провайдер Nest — для Storage (ТЗ §6).
 *
 * Ключ секретный и работает в обход RLS, поэтому модуль импортируют только
 * те модули, которым он действительно нужен, а глобальным он не делается.
 * Скрипты (seed) и e2e по-прежнему берут клиент напрямую из
 * `supabase-admin.ts`: контейнера зависимостей там нет.
 */
@Module({
  providers: [
    {
      provide: SUPABASE_ADMIN,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SupabaseClient =>
        createSupabaseAdminClient(
          config.getOrThrow<string>('SUPABASE_URL'),
          config.getOrThrow<string>('SUPABASE_SECRET_KEY'),
        ),
    },
  ],
  exports: [SUPABASE_ADMIN],
})
export class SupabaseModule {}
