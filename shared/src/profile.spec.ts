import { describe, expect, it } from 'vitest';

import { PHONE_DIGITS, PHONE_MAX_LENGTH, isValidPhone } from './profile.js';

/**
 * Одно правило на форму регистрации и на `PATCH /profile`: разъедься они —
 * форма пропустит то, что API отклонит.
 */

describe('isValidPhone', () => {
  it.each([
    '+7 900 000-00-00',
    '+79000000000',
    '89000000000',
    '8 (900) 000-00-00',
    '+1 (555) 123-4567',
    '+994 50 123 45 67',
  ])('принимает %s', (phone) => {
    expect(isValidPhone(phone)).toBe(true);
  });

  it.each([
    ['', 'пусто'],
    ['   ', 'одни пробелы'],
    ['телефон', 'буквы'],
    ['+7 900 000-00', 'девять цифр — меньше минимума'],
    ['+7900000000000000', 'шестнадцать цифр — больше максимума'],
    ['+7 900 000 00 00 доб. 12', 'буквы в добавочном'],
    ['7900000000@mail', 'посторонние символы'],
    ['++79000000000', 'два плюса'],
    ['7 900 000 00 00+', 'плюс не в начале'],
  ])('отклоняет %s (%s)', (phone) => {
    expect(isValidPhone(phone)).toBe(false);
  });

  it('считает цифры, а не длину строки', () => {
    const minimal = '0'.repeat(PHONE_DIGITS.min);
    expect(isValidPhone(minimal)).toBe(true);
    expect(isValidPhone('0'.repeat(PHONE_DIGITS.min - 1))).toBe(false);
    expect(isValidPhone('0'.repeat(PHONE_DIGITS.max))).toBe(true);
    expect(isValidPhone('0'.repeat(PHONE_DIGITS.max + 1))).toBe(false);
  });

  it('не пропускает номер длиннее колонки `User.phone`', () => {
    // Цифр в пределах нормы, а разделителей столько, что строка не поместится.
    const padded = `+7${' '.repeat(PHONE_MAX_LENGTH)}9000000000`;

    expect(padded.length).toBeGreaterThan(PHONE_MAX_LENGTH);
    expect(isValidPhone(padded)).toBe(false);
  });
});
