import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { parseCorsOrigins } from './config/env.validation.js';

/**
 * Общая настройка приложения: helmet, CORS, валидация, формат ошибок.
 *
 * Вынесено отдельно, чтобы e2e-тесты поднимали ровно то же приложение,
 * что уходит в прод. Иначе тесты со временем начинают проверять другую сборку.
 */
export function configureApp(app: INestApplication): INestApplication {
  const config = app.get(ConfigService);

  app.use(helmet());

  // API отдаёт только JSON и не хранит сессий в cookie — со стороны браузера
  // сюда ходит fetch с Bearer-токеном, поэтому credentials не нужны.
  app.enableCors({
    origin: parseCorsOrigins(config.getOrThrow<string>('CORS_ORIGINS')),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86_400,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  return app;
}
