import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { DEFAULT_PAGE_SIZE, MAX_PAGE, MAX_PAGE_SIZE, OrderStatus } from '@mybuild/shared';

import { ListOrdersQueryDto } from './list-orders.dto.js';

/**
 * Границы диапазонов — то, чего не видно ни в сервисе, ни в e2e на осмысленных
 * значениях: `page=1e20` доходил до Prisma и превращался в 500 (находка R3-С1).
 *
 * Проверяется тем же способом, каким запрос разбирает `ValidationPipe`:
 * `plainToInstance` с включённым приведением типов, затем `validateSync`.
 */
function parse(query: Record<string, unknown>) {
  const dto = plainToInstance(ListOrdersQueryDto, query, {
    enableImplicitConversion: true,
  });

  return { dto, errors: validateSync(dto) };
}

/** Какие поля не прошли проверку. */
function failedFields(query: Record<string, unknown>): string[] {
  return parse(query).errors.map((error) => error.property);
}

describe('ListOrdersQueryDto', () => {
  it('пустой запрос даёт первую страницу обычного размера', () => {
    const { dto, errors } = parse({});

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(dto.status).toBeUndefined();
    expect(dto.q).toBeUndefined();
  });

  it('принимает обе границы диапазона страниц', () => {
    expect(failedFields({ page: '1' })).toEqual([]);
    expect(failedFields({ page: String(MAX_PAGE) })).toEqual([]);
    expect(parse({ page: String(MAX_PAGE) }).dto.page).toBe(MAX_PAGE);
  });

  it.each([
    ['ноль', '0'],
    ['отрицательное', '-1'],
    ['за потолком', String(MAX_PAGE + 1)],
    ['показательная запись', '1e20'],
    ['дробное', '1.5'],
    ['не число', 'вторая'],
  ])('отклоняет номер страницы: %s', (_case, page) => {
    // `1e20` — целое по `Number.isInteger`, поэтому только `@Max` и отделяет
    // его от нормального номера: без этого `skip` уходил в Prisma как 2e+21.
    expect(failedFields({ page })).toEqual(['page']);
  });

  it('принимает обе границы размера страницы', () => {
    expect(failedFields({ pageSize: '1' })).toEqual([]);
    expect(failedFields({ pageSize: String(MAX_PAGE_SIZE) })).toEqual([]);
  });

  it.each(['0', String(MAX_PAGE_SIZE + 1), '20.5', 'много'])(
    'отклоняет размер страницы %s',
    (pageSize) => {
      expect(failedFields({ pageSize })).toEqual(['pageSize']);
    },
  );

  it('поиск обрезается по краям, а пустой запрос считается отсутствующим', () => {
    expect(parse({ q: '  ORD-7829  ' }).dto.q).toBe('ORD-7829');
    expect(parse({ q: '   ' }).dto.q).toBeUndefined();
  });

  it('отклоняет слишком длинный поиск и неизвестный статус', () => {
    expect(failedFields({ q: 'а'.repeat(201) })).toEqual(['q']);
    expect(failedFields({ status: 'НЕИЗВЕСТНО' })).toEqual(['status']);
    expect(failedFields({ status: OrderStatus.WAITING })).toEqual([]);
  });
});
