/**
 * Строка `OrderFile` → контракт API.
 *
 * Отдельный модуль, потому что мест два: файлы внутри заказа (`FilesService`)
 * и раздел «Документы» (`DocumentsService`). Две копии мапинга разъехались бы
 * молча — `storageKey` наружу не уходит, и заметить это по типам нельзя.
 */

import type { DocumentListItem, OrderFileDto } from '@mybuild/shared';

import type { OrderFile } from '../../generated/prisma/client.js';

/** Файл заказа. Путь в хранилище остаётся внутри backend. */
export function toOrderFileDto(file: OrderFile): OrderFileDto {
  return {
    id: file.id,
    orderId: file.orderId,
    ownerType: file.ownerType,
    submissionRound: file.submissionRound,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    createdAt: file.createdAt.toISOString(),
  };
}

/** Строка `OrderFile` вместе с заказом, к которому она относится. */
export type OrderFileWithOrder = OrderFile & {
  order: { orderNumber: number; title: string };
};

/**
 * Строка раздела «Документы»: тот же файл плюс номер и название заказа —
 * без них список файлов по всем заказам нечитаем (ТЗ §7).
 */
export function toDocumentListItem(row: OrderFileWithOrder): DocumentListItem {
  return {
    ...toOrderFileDto(row),
    orderNumber: row.order.orderNumber,
    orderTitle: row.order.title,
  };
}
