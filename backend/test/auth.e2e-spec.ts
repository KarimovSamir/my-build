import 'dotenv/config';

import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Role } from '@mybuild/shared';

import { Roles } from '../src/common/decorators/roles.decorator.js';
import {
  createE2eUser,
  dropE2eUsers,
  signInE2eUser,
  type E2eUser,
} from './support/e2e-users.js';

/**
 * Проверяет модель доступа целиком, на живом Supabase (ТЗ §10, DoD Фазы 2):
 * профиль создаётся триггером, роль приезжает claim'ом в токене, защищённый
 * маршрут отдаёт 401 без токена и 403 при чужой роли.
 *
 * Пользователи заводятся через Admin API с подтверждённым email — письма
 * не отправляются и лимит писем Supabase не тратится.
 */

/** Маршрут для проверки RolesGuard: в приложении ролевых маршрутов ещё нет. */
@Controller('e2e-company-only')
class CompanyOnlyController {
  @Get()
  @Roles(Role.COMPANY)
  read(): { ok: boolean } {
    return { ok: true };
  }
}

describe('Аутентификация и доступ (e2e)', () => {
  let app: INestApplication;
  let client: E2eUser;
  let company: E2eUser;
  let clientToken: string;
  let companyToken: string;

  beforeAll(async () => {
    await dropE2eUsers();

    client = await createE2eUser('auth-client', {
      role: Role.CLIENT,
      firstName: 'Анна',
      lastName: 'Тестова',
      phone: '+7 900 000-11-11',
      city: 'Москва',
      country: 'Россия',
    });
    company = await createE2eUser('auth-company', {
      role: Role.COMPANY,
      firstName: 'Иван',
      phone: '+7 900 000-22-22',
      companyName: 'ООО «Тест»',
    });

    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/bootstrap.js');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [CompanyOnlyController],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    [clientToken, companyToken] = await Promise.all([
      signInE2eUser(client),
      signInE2eUser(company),
    ]);
  });

  afterAll(async () => {
    await app?.close();
    await dropE2eUsers();
  });

  describe('профиль создаётся триггером из метаданных регистрации', () => {
    it('отдаёт профиль клиента со всеми полями из signUp', async () => {
      const response = await request(app.getHttpServer())
        .get('/profile')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: client.id,
        email: client.email,
        role: Role.CLIENT,
        firstName: 'Анна',
        lastName: 'Тестова',
        phone: '+7 900 000-11-11',
        city: 'Москва',
        country: 'Россия',
        // Название компании у клиента пустое даже если что-то передали.
        companyName: null,
      });
    });

    it('у компании заполнено название', async () => {
      const response = await request(app.getHttpServer())
        .get('/profile')
        .set('Authorization', `Bearer ${companyToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        role: Role.COMPANY,
        companyName: 'ООО «Тест»',
      });
    });
  });

  describe('защита маршрутов', () => {
    it('без токена отдаёт 401', async () => {
      const response = await request(app.getHttpServer()).get('/profile');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ statusCode: 401 });
    });

    it('с испорченным токеном отдаёт 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/profile')
        .set('Authorization', `Bearer ${clientToken}x`);

      expect(response.status).toBe(401);
    });

    it('с чужой схемой авторизации отдаёт 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/profile')
        .set('Authorization', `Basic ${clientToken}`);

      expect(response.status).toBe(401);
    });

    it('пускает нужную роль на ролевой маршрут', async () => {
      const response = await request(app.getHttpServer())
        .get('/e2e-company-only')
        .set('Authorization', `Bearer ${companyToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
    });

    it('отдаёт 403 при чужой роли', async () => {
      const response = await request(app.getHttpServer())
        .get('/e2e-company-only')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(response.status).toBe(403);
    });

    it('/health открыт без токена', async () => {
      const response = await request(app.getHttpServer()).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: 'ok', database: 'up' });
    });
  });

  describe('PATCH /profile', () => {
    it('меняет свои поля и не трогает остальные', async () => {
      const response = await request(app.getHttpServer())
        .patch('/profile')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ firstName: '  Анна-Мария  ', city: 'Казань' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        firstName: 'Анна-Мария',
        city: 'Казань',
        lastName: 'Тестова',
        role: Role.CLIENT,
      });
    });

    it('очищает необязательное поле пустой строкой', async () => {
      const response = await request(app.getHttpServer())
        .patch('/profile')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ lastName: '' });

      expect(response.status).toBe(200);
      expect(response.body.lastName).toBeNull();
    });

    it('не даёт клиенту завести название компании', async () => {
      const response = await request(app.getHttpServer())
        .patch('/profile')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ companyName: 'ООО «Не моё»' });

      expect(response.status).toBe(400);
    });

    it('не даёт компании стереть название', async () => {
      const response = await request(app.getHttpServer())
        .patch('/profile')
        .set('Authorization', `Bearer ${companyToken}`)
        .send({ companyName: '   ' });

      expect(response.status).toBe(400);
    });

    it('отклоняет неизвестные поля', async () => {
      const response = await request(app.getHttpServer())
        .patch('/profile')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ role: Role.COMPANY });

      expect(response.status).toBe(400);
    });
  });

});
