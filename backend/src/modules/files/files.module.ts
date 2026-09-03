import { Module } from '@nestjs/common';

import { SupabaseModule } from '../../supabase/supabase.module.js';
import { FilesService } from './files.service.js';
import { StorageService } from './storage.service.js';

/**
 * Файлы заказов (ТЗ §9).
 *
 * Своих маршрутов у модуля нет: файлы всегда прикладываются к заказу, поэтому
 * загрузка живёт на маршрутах `orders` (Фаза 3–4), а раздел «Документы»
 * появится в Фазе 6 и переиспользует этот же сервис.
 */
@Module({
  imports: [SupabaseModule],
  providers: [StorageService, FilesService],
  exports: [FilesService],
})
export class FilesModule {}
