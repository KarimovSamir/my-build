import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { DEFAULT_PAGE_SIZE } from '@mybuild/shared';

import { ListNotificationsQueryDto } from './list-notifications.dto.js';

/**
 * Проверяется не валидация вообще, а одно конкретное место: параметры запроса
 * приходят строками, и глобальный `ValidationPipe` включён
 * с `enableImplicitConversion`. Объяви `unread` типом `boolean` — и приведение
 * сделало бы `Boolean('false')`, то есть `?unread=false` означал бы ровно
 * обратное написанному, молча и без единой ошибки. Тест поднимает
 * трансформацию теми же настройками, что и приложение.
 */
function parse(query: Record<string, unknown>) {
  const dto = plainToInstance(ListNotificationsQueryDto, query, {
    enableImplicitConversion: true,
  });

  return { dto, errors: validateSync(dto, { whitelist: true }) };
}

describe('ListNotificationsQueryDto', () => {
  it('без параметров фильтра нет, а страница первая', () => {
    const { dto, errors } = parse({});

    expect(errors).toHaveLength(0);
    expect(dto.unreadOnly).toBeUndefined();
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it.each([
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
  ])('разбирает unread=%s как %s', (raw, expected) => {
    const { dto, errors } = parse({ unread: raw });

    expect(errors).toHaveLength(0);
    expect(dto.unreadOnly).toBe(expected);
  });

  it.each(['yes', '', 'да', 'TRUE'])(
    'на unread=%s отвечает отказом, а не полным списком',
    (raw) => {
      const { errors } = parse({ unread: raw });

      expect(errors).toHaveLength(1);
      expect(JSON.stringify(errors)).toContain('unread');
    },
  );

  it('номер страницы разбирает числом', () => {
    const { dto, errors } = parse({ page: '3', pageSize: '10' });

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(3);
    expect(dto.pageSize).toBe(10);
  });
});
