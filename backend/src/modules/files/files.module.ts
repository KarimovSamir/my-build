import { Module } from '@nestjs/common';

import { ThrottleGuard } from '../../common/guards/throttle.guard.js';
import { SupabaseModule } from '../../supabase/supabase.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { FilesService } from './files.service.js';
import { StorageService } from './storage.service.js';

/**
 * Файлы заказов (ТЗ §9).
 *
 * Загрузка своих маршрутов не имеет: файлы всегда прикладываются к заказу,
 * поэтому она живёт на маршрутах `orders` (Фазы 3–4). Наружу модуль отдаёт
 * раздел «Документы» — список всех своих файлов и скачивание.
 *
 * `ThrottleGuard` объявлен провайдером: он висит на `DocumentsController`
 * через `@UseGuards`, а окна у него свои на каждый экземпляр.
 */
@Module({
  imports: [SupabaseModule],
  controllers: [DocumentsController],
  providers: [StorageService, FilesService, DocumentsService, ThrottleGuard],
  exports: [FilesService],
})
export class FilesModule {}
