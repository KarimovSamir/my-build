/**
 * Какие файлы попадают в раздел «Документы» (ТЗ §5, §4.1).
 *
 * Условие вынесено отдельным модулем без Nest и без базы — как
 * `available-orders.ts` у ленты компании: это правило доступа, и проверяться
 * оно должно unit-тестами целиком, а не только прогоном по живым данным.
 */

import { EXECUTOR_OFFER_STATUSES, type FileOwnerType } from '@mybuild/shared';

import type { Prisma } from '../../generated/prisma/client.js';

/** Списки в `shared/` объявлены `readonly`, а Prisma ждёт изменяемый массив. */
const EXECUTOR_STATUSES = [...EXECUTOR_OFFER_STATUSES];

export interface DocumentScope {
  userId: string;
  /** Фильтр «чьи файлы»: задание клиента или сдачи исполнителя. */
  ownerType?: FileOwnerType;
  /** Фильтр по конкретному заказу. Чужой заказ просто ничего не найдёт. */
  orderId?: string;
}

/**
 * Свои документы — это файлы заказов, в которых пользователь **сторона сделки**:
 * либо он клиент заказа, либо его предложение приняли (`EXECUTOR_OFFER_STATUSES`,
 * `COMPLETED` включён — доступ к своей же работе после сдачи сохраняется).
 *
 * Роль здесь не спрашивается намеренно: право даёт связь с заказом, а не claim
 * в токене, который живёт час и может устареть, — то же правило, что
 * и в `FilesService.assertFileAccess`. Клиент не бывает автором предложения,
 * а компания не бывает владельцем заказа, поэтому `OR` из двух условий точен
 * для обеих ролей и не даёт лишнего никому.
 *
 * Заказы, по которым компания только подала предложение, сюда не входят, хотя
 * задание клиента она в них скачать может (`companySeesTaskFiles`). Раздел —
 * про «свои файлы по своим заказам» (ТЗ §5), а такой заказ ещё не её: набор
 * менялся бы сам собой каждый раз, когда клиент выбирает другого исполнителя.
 * Список при этом строго уже прав на скачивание, то есть показанное всегда
 * скачивается.
 */
export function buildDocumentsWhere(scope: DocumentScope): Prisma.OrderFileWhereInput {
  const where: Prisma.OrderFileWhereInput = {
    order: {
      OR: [
        { clientId: scope.userId },
        {
          offers: {
            some: { companyId: scope.userId, status: { in: EXECUTOR_STATUSES } },
          },
        },
      ],
    },
  };

  if (scope.ownerType !== undefined) {
    where.ownerType = scope.ownerType;
  }

  if (scope.orderId !== undefined) {
    where.orderId = scope.orderId;
  }

  return where;
}
