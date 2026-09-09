import { describe, expect, it } from 'vitest';

import { OfferStatus, Role } from '@mybuild/shared';

import { COMPLETED_OFFERS_FILTER, buildContractorsWhere } from './contractor-search.js';

/**
 * Отбор в каталог подрядчиков (ТЗ §5, §7).
 *
 * Условие проверяется отдельно от базы, потому что ошибка в нём тихая:
 * пропавшая проверка роли превратила бы каталог компаний в список всех
 * пользователей вместе с их телефонами.
 */

describe('buildContractorsWhere', () => {
  it('берёт только компании с названием', () => {
    const where = buildContractorsWhere();

    expect(where.role).toBe(Role.COMPANY);
    expect(where.companyName).toEqual({ not: null });
  });

  it('без поиска условий по тексту не добавляет', () => {
    expect(buildContractorsWhere().OR).toBeUndefined();
    expect(buildContractorsWhere('').OR).toBeUndefined();
  });

  it('ищет по названию и городу без учёта регистра', () => {
    expect(buildContractorsWhere('строй').OR).toEqual([
      { companyName: { contains: 'строй', mode: 'insensitive' } },
      { city: { contains: 'строй', mode: 'insensitive' } },
    ]);
  });

  it('роль остаётся в условии и при поиске', () => {
    // `OR` не должен подменять отбор: иначе запрос «Анна» нашёл бы клиента.
    expect(buildContractorsWhere('Анна').role).toBe(Role.COMPANY);
  });

  it('экранирует подстановочные символы LIKE', () => {
    const [byName] = buildContractorsWhere('100%_').OR as [
      { companyName: { contains: string } },
    ];

    // Без экранирования запрос «%» совпал бы со всем каталогом.
    expect(byName.companyName.contains).toBe('100\\%\\_');
  });

  it('завершённым считается заказ с предложением в статусе COMPLETED', () => {
    expect(COMPLETED_OFFERS_FILTER).toEqual({ status: OfferStatus.COMPLETED });
  });
});
