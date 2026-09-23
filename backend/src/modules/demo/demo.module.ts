import { Module } from '@nestjs/common';

import { SupabaseModule } from '../../supabase/supabase.module.js';
import { FilesModule } from '../files/files.module.js';
import { DemoResetService } from './demo-reset.service.js';

/**
 * Демо-доступ: плановый сброс общих учёток с экрана входа.
 *
 * Маршрутов нет — сброс запускает таймер процесса. Отдельный маршрут
 * «сбросить сейчас» пришлось бы защищать секретом, а плановый запуск
 * и `npm run db:seed` закрывают обе нужды без него.
 */
@Module({
  imports: [SupabaseModule, FilesModule],
  providers: [DemoResetService],
})
export class DemoModule {}
