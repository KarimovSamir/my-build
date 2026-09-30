import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import type { DocumentListItem, DownloadLink, Paginated } from '@mybuild/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Throttle } from '../../common/decorators/throttle.decorator.js';
import { ThrottleGuard } from '../../common/guards/throttle.guard.js';
import type { AuthUser } from '../auth/auth-user.js';
import { DocumentsService } from './documents.service.js';
import { ListDocumentsQueryDto } from './dto/list-documents.dto.js';
import { FilesService } from './files.service.js';

/**
 * Документы пользователя (ТЗ §5): единый список файлов по всем своим заказам
 * и ссылка на скачивание.
 *
 * Права здесь не в guard'ах, а в самих запросах, и причина у обоих маршрутов
 * одна: `:id` — это файл, а не заказ, и `OwnershipGuard` искать по нему нечего.
 * Список ограничивает `buildDocumentsWhere`, отдельный файл — `assertFileAccess`.
 * Право даёт связь с заказом, а не роль в токене; роль всё же передаётся —
 * по ней различается «любая компания» в правиле о файлах задания (ТЗ §4.1).
 *
 * `ThrottleGuard` стоит на контроллере целиком, хотя оба маршрута только
 * читают: каждое скачивание — обращение к Supabase Storage за подписью,
 * то есть расход внешней квоты, а не своей базы.
 */
@UseGuards(ThrottleGuard)
@Throttle({ limit: 60, ttl: 60_000 })
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly files: FilesService,
    private readonly documents: DocumentsService,
  ) {}

  /**
   * Все свои файлы одним списком: фильтры по владельцу и заказу, пагинация.
   * Смысл раздела — найти файл, не заходя в заказы (ТЗ §7).
   */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListDocumentsQueryDto,
  ): Promise<Paginated<DocumentListItem>> {
    return this.documents.list(user.id, query);
  }

  /**
   * Signed URL на скачивание. Подпись живёт пять минут и выдаётся только
   * участнику заказа (ТЗ §6).
   *
   * `:id` разбирается как UUID до похода в базу: колонка `OrderFile.id` имеет
   * тип `uuid`, и мусор в пути упал бы в Postgres, то есть на 500.
   */
  @Get(':id/download')
  download(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException('Файл не найден') }))
    fileId: string,
  ): Promise<DownloadLink> {
    return this.files.getDownloadUrl(fileId, { id: user.id, role: user.role });
  }
}
