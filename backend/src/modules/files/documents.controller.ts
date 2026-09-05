import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';

import type { DownloadLink } from '@mybuild/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/auth-user.js';
import { FilesService } from './files.service.js';

/**
 * Документы пользователя (ТЗ §5).
 *
 * Пока здесь только скачивание: оно нужно уже на странице заказа (Фаза 3),
 * а единый список всех файлов по всем заказам (`GET /documents`) появится
 * в Фазе 6 и будет жить на этом же контроллере.
 *
 * Права проверяет `FilesService.assertFileAccess`: их даёт связь с заказом,
 * а не роль в токене. Роль всё же передаётся — по ней различается «любая
 * компания» в правиле о файлах задания (ТЗ §4.1).
 */
@Controller('documents')
export class DocumentsController {
  constructor(private readonly files: FilesService) {}

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
