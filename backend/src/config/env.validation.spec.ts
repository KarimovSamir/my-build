import { describe, expect, it } from 'vitest';

import { NodeEnv, parseCorsOrigins, validateEnv } from './env.validation.js';

const minimalEnv = {
  DATABASE_URL: 'postgresql://user:pass@host:6543/postgres?pgbouncer=true',
  DIRECT_URL: 'postgresql://user:pass@host:5432/postgres',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_example',
};

describe('validateEnv', () => {
  it('принимает минимальный набор переменных и подставляет значения по умолчанию', () => {
    const config = validateEnv({ ...minimalEnv });

    expect(config.NODE_ENV).toBe(NodeEnv.Development);
    expect(config.PORT).toBe(4000);
    expect(config.CORS_ORIGINS).toBe('http://localhost:3000');
    expect(config.SUPABASE_STORAGE_BUCKET).toBe('order-files');
  });

  it('приводит PORT из строки к числу', () => {
    const config = validateEnv({ ...minimalEnv, PORT: '5000' });

    expect(config.PORT).toBe(5000);
  });

  it('падает, если не задана строка подключения к базе', () => {
    const { DATABASE_URL: _omitted, ...withoutDatabase } = minimalEnv;

    expect(() => validateEnv(withoutDatabase)).toThrowError(/DATABASE_URL/);
  });

  it('падает при некорректном адресе Supabase', () => {
    expect(() =>
      validateEnv({ ...minimalEnv, SUPABASE_URL: 'не-адрес' }),
    ).toThrowError(/SUPABASE_URL/);
  });

  it('падает при недопустимом NODE_ENV', () => {
    expect(() =>
      validateEnv({ ...minimalEnv, NODE_ENV: 'staging' }),
    ).toThrowError(/NODE_ENV/);
  });

  it('не требует переменных проверки JWT до Фазы 2', () => {
    expect(() => validateEnv({ ...minimalEnv })).not.toThrow();
  });
});

describe('parseCorsOrigins', () => {
  it('разбирает список адресов через запятую и убирает пробелы', () => {
    expect(parseCorsOrigins('http://localhost:3000, https://mybuild.app')).toEqual([
      'http://localhost:3000',
      'https://mybuild.app',
    ]);
  });

  it('отбрасывает пустые элементы', () => {
    expect(parseCorsOrigins('http://localhost:3000,,')).toEqual([
      'http://localhost:3000',
    ]);
  });
});
