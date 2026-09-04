import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { OFFER_LIMITS } from '@mybuild/shared';

import { CreateOfferDto } from './create-offer.dto.js';

/**
 * Разбирается тем же способом, каким запрос разбирает `ValidationPipe`:
 * `plainToInstance` с включённым приведением типов, затем `validateSync`.
 */
function parse(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateOfferDto, payload, { enableImplicitConversion: true });

  return { dto, errors: validateSync(dto) };
}

function failedFields(payload: Record<string, unknown>): string[] {
  return parse(payload).errors.map((error) => error.property);
}

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

/** Дата в будущем: срок выполнения в прошлом не принимается. */
function inDays(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function offerBody(overrides: Record<string, unknown> = {}) {
  return {
    orderId: ORDER_ID,
    proposedPrice: '150000.50',
    proposedDeadline: inDays(30),
    ...overrides,
  };
}

describe('CreateOfferDto', () => {
  it('принимает предложение без комментария', () => {
    const { dto, errors } = parse(offerBody());

    expect(errors).toHaveLength(0);
    expect(dto.comment).toBeUndefined();
  });

  it('пустой комментарий считается отсутствующим', () => {
    // Браузер отправляет незаполненное поле формы пустой строкой,
    // а не пропускает его.
    expect(parse(offerBody({ comment: '   ' })).dto.comment).toBeUndefined();
    expect(parse(offerBody({ comment: '  Возьмёмся  ' })).dto.comment).toBe('Возьмёмся');
  });

  it('требует заказ, цену и срок', () => {
    expect(failedFields({}).toSorted()).toEqual([
      'orderId',
      'proposedDeadline',
      'proposedPrice',
    ]);
  });

  it('отклоняет заказ, который не похож на идентификатор', () => {
    expect(failedFields(offerBody({ orderId: 'ORD-7829' }))).toEqual(['orderId']);
  });

  it.each(['0', '0.00', '-100', '100.555', 'дорого', ''])(
    'отклоняет цену %s',
    (proposedPrice) => {
      expect(failedFields(offerBody({ proposedPrice }))).toEqual(['proposedPrice']);
    },
  );

  it('отклоняет срок в прошлом', () => {
    expect(failedFields(offerBody({ proposedDeadline: inDays(-1) }))).toEqual([
      'proposedDeadline',
    ]);
  });

  it('отклоняет срок, который не разбирается как дата', () => {
    expect(failedFields(offerBody({ proposedDeadline: 'через месяц' }))).toEqual([
      'proposedDeadline',
    ]);
  });

  it('отклоняет слишком длинный комментарий', () => {
    const comment = 'а'.repeat(OFFER_LIMITS.comment.max + 1);

    expect(failedFields(offerBody({ comment }))).toEqual(['comment']);
    expect(failedFields(offerBody({ comment: comment.slice(1) }))).toEqual([]);
  });
});
