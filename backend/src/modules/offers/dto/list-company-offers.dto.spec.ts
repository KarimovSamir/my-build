import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { OfferStatus } from '@mybuild/shared';

import { ListCompanyOffersQueryDto } from './list-company-offers.dto.js';

/**
 * Проверяется то же место, что и у `?unread=` в уведомлениях: параметры
 * приходят строками, а глобальный `ValidationPipe` включён
 * с `enableImplicitConversion`. Объяви `executor` типом `boolean` — и
 * `Boolean('false')` сделал бы `?executor=false` полной противоположностью
 * написанному, молча и без единой ошибки.
 */
function parse(query: Record<string, unknown>) {
  const dto = plainToInstance(ListCompanyOffersQueryDto, query, {
    enableImplicitConversion: true,
  });

  return { dto, errors: validateSync(dto, { whitelist: true }) };
}

describe('ListCompanyOffersQueryDto', () => {
  it('без параметров фильтров нет', () => {
    const { dto, errors } = parse({});

    expect(errors).toHaveLength(0);
    expect(dto.status).toBeUndefined();
    expect(dto.executorOnly).toBeUndefined();
  });

  it('разбирает статус', () => {
    const { dto, errors } = parse({ status: OfferStatus.SENT });

    expect(errors).toHaveLength(0);
    expect(dto.status).toBe(OfferStatus.SENT);
  });

  it('неизвестный статус отклоняет', () => {
    expect(parse({ status: 'ЛЮБОЙ' }).errors).toHaveLength(1);
  });

  it.each([
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
  ])('разбирает executor=%s как %s', (raw, expected) => {
    const { dto, errors } = parse({ executor: raw });

    expect(errors).toHaveLength(0);
    expect(dto.executorOnly).toBe(expected);
  });

  it.each(['yes', '', 'да', 'TRUE'])(
    'на executor=%s отвечает отказом, а не полным списком',
    (raw) => {
      const { errors } = parse({ executor: raw });

      expect(errors).toHaveLength(1);
      expect(JSON.stringify(errors)).toContain('executor');
    },
  );
});
