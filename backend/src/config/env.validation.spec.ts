import { describe, expect, it } from 'vitest';

import { NodeEnv, parseCorsOrigins, validateEnv } from './env.validation.js';

const minimalEnv = {
  DATABASE_URL: 'postgresql://user:pass@host:6543/postgres?pgbouncer=true',
  DIRECT_URL: 'postgresql://user:pass@host:5432/postgres',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_example',
  SUPABASE_JWKS_URL: 'https://example.supabase.co/auth/v1/.well-known/jwks.json',
  SUPABASE_JWT_ISSUER: 'https://example.supabase.co/auth/v1',
};

describe('validateEnv', () => {
  it('принимает минимальный набор переменных и подставляет значения по умолчанию', () => {
    const config = validateEnv({ ...minimalEnv });

    expect(config.NODE_ENV).toBe(NodeEnv.Development);
    expect(config.PORT).toBe(4000);
    expect(config.CORS_ORIGINS).toBe('http://localhost:3000');
    expect(config.SUPABASE_STORAGE_BUCKET).toBe('order-files');
    expect(config.SUPABASE_JWT_AUDIENCE).toBe('authenticated');
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

  it('падает без адреса JWKS: без него не проверить ни один токен', () => {
    const { SUPABASE_JWKS_URL: _omitted, ...withoutJwks } = minimalEnv;

    expect(() => validateEnv(withoutJwks)).toThrowError(/SUPABASE_JWKS_URL/);
  });

  it('падает без издателя токена', () => {
    const { SUPABASE_JWT_ISSUER: _omitted, ...withoutIssuer } = minimalEnv;

    expect(() => validateEnv(withoutIssuer)).toThrowError(/SUPABASE_JWT_ISSUER/);
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
