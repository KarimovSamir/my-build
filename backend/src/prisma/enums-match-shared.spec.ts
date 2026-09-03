import * as shared from '@mybuild/shared';
import { describe, expect, it } from 'vitest';

import * as prisma from '../generated/prisma/enums.js';

/**
 * Enum-ы живут в двух местах: в Prisma-схеме (структура базы) и в `shared/`
 * (контракт с фронтом). Дублирования не избежать — Prisma не умеет брать
 * значения из чужого пакета, — поэтому расхождение ловится тестом.
 *
 * Без этой проверки добавленный только в схему статус тихо доезжает до фронта
 * и падает уже в рантайме: `orderStatusLabels[status]` вернёт undefined.
 *
 * Если тест упал — привести в соответствие `backend/prisma/schema.prisma`
 * и `shared/src/enums.ts`, а затем прогнать `npm run db:generate`.
 */

const enumPairs = {
  Role: [shared.Role, prisma.Role],
  OrderCategory: [shared.OrderCategory, prisma.OrderCategory],
  ObjectType: [shared.ObjectType, prisma.ObjectType],
  OrderStatus: [shared.OrderStatus, prisma.OrderStatus],
  OfferStatus: [shared.OfferStatus, prisma.OfferStatus],
  FileOwnerType: [shared.FileOwnerType, prisma.FileOwnerType],
  NotificationType: [shared.NotificationType, prisma.NotificationType],
} as const satisfies Record<string, readonly [object, object]>;

describe('enum-ы shared и Prisma', () => {
  it.each(Object.entries(enumPairs))(
    '%s совпадает по значениям',
    (_name, [sharedEnum, prismaEnum]) => {
      expect(Object.values(sharedEnum).toSorted()).toEqual(
        Object.values(prismaEnum).toSorted(),
      );
    },
  );

  it('ключ и значение совпадают — иначе не сойдётся запись в базу', () => {
    for (const [sharedEnum] of Object.values(enumPairs)) {
      for (const [key, value] of Object.entries(sharedEnum)) {
        expect(value).toBe(key);
      }
    }
  });
});
