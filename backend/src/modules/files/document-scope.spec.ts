import { describe, expect, it } from 'vitest';

import { FileOwnerType, OfferStatus } from '@mybuild/shared';

import { buildDocumentsWhere } from './document-scope.js';

/**
 * Область видимости раздела «Документы» (ТЗ §5, §4.1).
 *
 * Проверяется здесь, а не только в e2e: слишком широкое условие отдаёт чужие
 * чертежи, слишком узкое — прячет от исполнителя его собственную сдачу после
 * завершения заказа. И то и другое на живых данных заметно не сразу.
 */

const USER = '11111111-1111-4111-8111-111111111111';
const ORDER = '22222222-2222-4222-8222-222222222222';

/** Условие по заказу: два способа быть стороной сделки. */
function orderConditions(where: ReturnType<typeof buildDocumentsWhere>) {
  return (where.order as { OR: Record<string, unknown>[] }).OR;
}

describe('buildDocumentsWhere', () => {
  it('пускает файлы своих заказов и заказов, где пользователь — исполнитель', () => {
    expect(orderConditions(buildDocumentsWhere({ userId: USER }))).toEqual([
      { clientId: USER },
      {
        offers: {
          some: {
            companyId: USER,
            status: {
              in: [
                OfferStatus.ACCEPTED,
                OfferStatus.WORK_SUBMITTED,
                OfferStatus.BACK_FOR_OVERRIDE,
                OfferStatus.COMPLETED,
              ],
            },
          },
        },
      },
    ]);
  });

  it('оставляет исполнителю доступ после завершения заказа', () => {
    const [, executor] = orderConditions(buildDocumentsWhere({ userId: USER })) as [
      unknown,
      { offers: { some: { status: { in: OfferStatus[] } } } },
    ];

    // Работа сдана и принята — свои же файлы компания обязана находить и потом.
    expect(executor.offers.some.status.in).toContain(OfferStatus.COMPLETED);
  });

  it('не пускает заказ, по которому предложение только отправлено', () => {
    const [, executor] = orderConditions(buildDocumentsWhere({ userId: USER })) as [
      unknown,
      { offers: { some: { status: { in: OfferStatus[] } } } },
    ];

    // Такой заказ ещё не её: набор документов менялся бы сам собой каждый раз,
    // когда клиент выбирает другого исполнителя.
    expect(executor.offers.some.status.in).not.toContain(OfferStatus.SENT);
    expect(executor.offers.some.status.in).not.toContain(OfferStatus.NOT_ACCEPTED);
    expect(executor.offers.some.status.in).not.toContain(OfferStatus.WITHDRAWN);
  });

  it('без фильтров других условий не добавляет', () => {
    const where = buildDocumentsWhere({ userId: USER });

    expect(where.ownerType).toBeUndefined();
    expect(where.orderId).toBeUndefined();
  });

  it('фильтры сужают выборку, но не заменяют условие доступа', () => {
    const where = buildDocumentsWhere({
      userId: USER,
      ownerType: FileOwnerType.COMPANY,
      orderId: ORDER,
    });

    expect(where.ownerType).toBe(FileOwnerType.COMPANY);
    expect(where.orderId).toBe(ORDER);
    // Фильтр по заказу — это удобство, а не право: чужой идентификатор
    // не должен открывать чужие файлы.
    expect(orderConditions(where)).toHaveLength(2);
  });
});
