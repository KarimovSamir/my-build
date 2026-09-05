import { describe, expect, it } from 'vitest';

import {
  NotificationType,
  ObjectType,
  OfferStatus,
  OrderCategory,
  OrderStatus,
  Role,
} from './enums.js';
import {
  MAX_ORDER_NUMBER,
  formatOrderNumber,
  notificationTypeLabels,
  objectTypeLabels,
  offerStatusLabels,
  offerStatusTones,
  orderCategoryLabels,
  orderEventLabels,
  orderStatusLabels,
  orderStatusTones,
  parseOrderNumber,
  roleLabels,
} from './labels.js';
import { OrderEventType } from './state.js';

/**
 * Разбор номера заказа — вход пользователя, который идёт прямо в колонку `Int`:
 * без границы запрос падал бы в Postgres (см. `MAX_ORDER_NUMBER`).
 */

describe('parseOrderNumber', () => {
  it.each([
    ['7829', 7829],
    ['ORD-7829', 7829],
    ['ord-7829', 7829],
    ['  ORD-7829  ', 7829],
    ['0007829', 7829],
    ['1', 1],
    [String(MAX_ORDER_NUMBER), MAX_ORDER_NUMBER],
  ])('разбирает %s как %i', (query, expected) => {
    expect(parseOrderNumber(query)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    'ремонт',
    'ORD',
    'ORD-',
    'ORD-abc',
    '-5',
    '7 829',
    '78.29',
    'ORD_7829',
    'ORD-7829x',
    '0',
    String(MAX_ORDER_NUMBER + 1),
    '99999999999999999999',
  ])('не считает номером: %s', (query) => {
    expect(parseOrderNumber(query)).toBeNull();
  });

  it('номер за пределами колонки `Int` до базы не доходит', () => {
    expect(parseOrderNumber(String(MAX_ORDER_NUMBER))).toBe(MAX_ORDER_NUMBER);
    expect(parseOrderNumber(String(MAX_ORDER_NUMBER + 1))).toBeNull();
  });
});

describe('formatOrderNumber', () => {
  it('подписывает заказ так же, как его ищут', () => {
    expect(formatOrderNumber(7829)).toBe('ORD-7829');
    expect(parseOrderNumber(formatOrderNumber(7829))).toBe(7829);
  });
});

describe('названия для интерфейса', () => {
  const tones = ['gray', 'yellow', 'blue', 'green', 'red'];

  it.each([
    ['ролей', Role, roleLabels],
    ['категорий', OrderCategory, orderCategoryLabels],
    ['типов объекта', ObjectType, objectTypeLabels],
    ['статусов заказа', OrderStatus, orderStatusLabels],
    ['статусов предложения', OfferStatus, offerStatusLabels],
    ['типов уведомления', NotificationType, notificationTypeLabels],
    ['событий заказа', OrderEventType, orderEventLabels],
  ])('у всех %s есть непустое русское название', (_name, values, labels) => {
    for (const value of Object.values(values)) {
      const label = (labels as Record<string, string>)[value];
      expect(label).toBeTruthy();
      // Русский — только в UI-текстах, но названия обязаны быть на русском.
      expect(label).toMatch(/[а-яё]/i);
    }
  });

  it.each([
    ['заказа', OrderStatus, orderStatusTones],
    ['предложения', OfferStatus, offerStatusTones],
  ])('у каждого статуса %s есть цвет из набора', (_name, values, byStatus) => {
    for (const value of Object.values(values)) {
      expect(tones).toContain((byStatus as Record<string, string>)[value]);
    }
  });
});
