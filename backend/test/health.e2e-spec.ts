import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Проверяет, что приложение поднимается целиком и честно сообщает о состоянии.
 *
 * База здесь заведомо недоступна (адрес указывает в никуда) — это и проверяем:
 * сервер не падает, а `/health` отдаёт 503 с причиной. Проверка «база жива»
 * появится, когда в CI будет реальное подключение.
 */
describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      PORT: '4000',
      CORS_ORIGINS: 'http://localhost:3000',
      DATABASE_URL: 'postgresql://user:pass@127.0.0.1:1/postgres',
      DIRECT_URL: 'postgresql://user:pass@127.0.0.1:1/postgres',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SECRET_KEY: 'sb_secret_test',
      SUPABASE_JWKS_URL: 'https://example.supabase.co/auth/v1/.well-known/jwks.json',
      SUPABASE_JWT_ISSUER: 'https://example.supabase.co/auth/v1',
      SUPABASE_JWT_AUDIENCE: 'authenticated',
      SUPABASE_STORAGE_BUCKET: 'order-files',
    });

    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/bootstrap.js');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('отдаёт 503 и причину, когда база недоступна', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: 'degraded',
      database: 'down',
    });
    expect(typeof response.body.databaseError).toBe('string');
    expect(typeof response.body.uptimeSeconds).toBe('number');
  });

  it('на неизвестном маршруте отдаёт ошибку в едином формате', async () => {
    const response = await request(app.getHttpServer()).get('/no-such-route');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      statusCode: 404,
      error: expect.any(String),
    });
    expect(response.body).toHaveProperty('message');
  });
});
