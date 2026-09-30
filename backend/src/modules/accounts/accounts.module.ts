import { Module } from '@nestjs/common';

import { SupabaseModule } from '../../supabase/supabase.module.js';
import { StaleSignupsService } from './stale-signups.service.js';

/**
 * Учётки: плановая уборка неподтверждённых регистраций.
 *
 * Маршрутов нет — уборку запускает таймер процесса, как сброс демо.
 */
@Module({
  imports: [SupabaseModule],
  providers: [StaleSignupsService],
})
export class AccountsModule {}
