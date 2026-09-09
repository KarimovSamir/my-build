/**
 * Раздел «Документы»: все файлы пользователя по всем его заказам (ТЗ §5).
 *
 * Сервис отдельный от `FilesService`, хотя оба про файлы: тот отвечает
 * за хранилище, содержимое и права на отдельный файл, а этот — только
 * за выборку списка. Само правило видимости живёт в чистом `document-scope.ts`.
 */

import { Injectable } from '@nestjs/common';
import type { DocumentListItem, Paginated } from '@mybuild/shared';

import { pageRequest, toPage } from '../../common/pagination.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { buildDocumentsWhere } from './document-scope.js';
import type { ListDocumentsQueryDto } from './dto/list-documents.dto.js';
import { toDocumentListItem } from './file-view.js';

/**
 * Новые файлы сверху. `id` вторым ключом обязателен: `createdAt` идёт
 * из `DEFAULT CURRENT_TIMESTAMP`, то есть это время **начала транзакции**,
 * одно на все строки одной загрузки. Без второго ключа порядок внутри такой
 * пачки остаётся на усмотрение Postgres и может меняться между запросами —
 * а в постраничном списке это уже не косметика: строка способна пропасть
 * со второй страницы, потому что уехала на первую.
 */
const ORDER_BY: Prisma.OrderFileOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    query: ListDocumentsQueryDto,
  ): Promise<Paginated<DocumentListItem>> {
    const where = buildDocumentsWhere({
      userId,
      ownerType: query.ownerType,
      orderId: query.orderId,
    });

    const request = pageRequest(query);

    const [total, rows] = await Promise.all([
      this.prisma.orderFile.count({ where }),
      this.prisma.orderFile.findMany({
        where,
        orderBy: ORDER_BY,
        skip: request.skip,
        take: request.pageSize,
        include: { order: { select: { orderNumber: true, title: true } } },
      }),
    ]);

    return toPage(rows.map(toDocumentListItem), request, total);
  }
}
