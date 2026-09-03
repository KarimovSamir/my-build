import { Module } from '@nestjs/common';

import { SupabaseModule } from '../../supabase/supabase.module.js';
import { DocumentsController } from './documents.controller.js';
import { FilesService } from './files.service.js';
import { StorageService } from './storage.service.js';

/**
 * Файлы заказов (ТЗ §9).
 *
 * Загрузка своих маршрутов не имеет: файлы всегда прикладываются к заказу,
 * поэтому она живёт на маршрутах `orders` (Фазы 3–4). Наружу модуль отдаёт
 * только раздел «Документы» — пока в объёме скачивания, список появится
 * в Фазе 6.
 */
@Module({
  imports: [SupabaseModule],
  controllers: [DocumentsController],
  providers: [StorageService, FilesService],
  exports: [FilesService],
})
export class FilesModule {}
