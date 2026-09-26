import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { UpdateProfileDto } from './update-profile.dto.js';

/** Разбирается так же, как запрос разбирает глобальный `ValidationPipe`. */
function failedFields(payload: Record<string, unknown>): string[] {
  const dto = plainToInstance(UpdateProfileDto, payload, { enableImplicitConversion: true });
  return validateSync(dto).map((error) => error.property);
}

const FIELDS = ['firstName', 'lastName', 'phone', 'city', 'country', 'companyName'];

describe('UpdateProfileDto', () => {
  it('принимает пустой запрос: незаданные поля не трогаются', () => {
    expect(failedFields({})).toEqual([]);
  });

  it.each(FIELDS)('отклоняет null в поле %s, а не пропускает его в базу', (field) => {
    // `@IsOptional` пропускал null, и Prisma падала на обязательной колонке —
    // наружу уходил 500. Очистка поля — пустая строка, а не null.
    expect(failedFields({ [field]: null })).toEqual([field]);
  });

  it('пустая строка в необязательном поле проходит — это «очистить»', () => {
    expect(failedFields({ lastName: '', city: '', country: '' })).toEqual([]);
  });

  it('пустая строка в обязательном поле — ошибка', () => {
    expect(failedFields({ firstName: '  ', phone: '' }).toSorted()).toEqual(['firstName', 'phone']);
  });
});
