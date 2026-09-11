import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Express } from 'express';
import helmet from 'helmet';

import { actorContextMiddleware } from './common/actor-context.js';
import { requestLoggerMiddleware } from './common/request-logger.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { NodeEnv, parseCorsOrigins } from './config/env.validation.js';

/**
 * Общая настройка приложения: helmet, CORS, валидация, формат ошибок.
 *
 * Вынесено отдельно, чтобы e2e-тесты поднимали ровно то же приложение,
 * что уходит в прод. Иначе тесты со временем начинают проверять другую сборку.
 */
export function configureApp(app: INestApplication): INestApplication {
  const config = app.get(ConfigService);

  // В проде приложение стоит за обратным прокси площадки, и настоящий адрес
  // клиента приходит в `X-Forwarded-For`. Без этой строки `request.ip` — адрес
  // прокси, то есть один на всех: лимит частоты для анонимных запросов
  // (`/health`) считался бы общим счётчиком, а в логе стоял бы чужой адрес.
  //
  // Только в проде: без прокси заголовок подделывает кто угодно, и доверие
  // к нему само стало бы дырой в ограничителе частоты.
  if (config.get<string>('NODE_ENV') === NodeEnv.Production) {
    const server = app.getHttpAdapter().getInstance() as Express;
    server.set('trust proxy', 1);
  }

  app.use(helmet());

  // Первым после helmet: строка в лог обязана появиться и у запроса, который
  // дальше отобьют guard'ы, и замер времени должен охватывать всю обработку.
  app.use(requestLoggerMiddleware);

  // Автор запроса в терминах WebSocket: нужен рассылке, чтобы не слать событие
  // той вкладке, которая действие и выполнила (`common/actor-context.ts`).
  app.use(actorContextMiddleware);

  // API отдаёт только JSON и не хранит сессий в cookie — со стороны браузера
  // сюда ходит fetch с Bearer-токеном, поэтому credentials не нужны.
  app.enableCors({
    origin: parseCorsOrigins(config.getOrThrow<string>('CORS_ORIGINS')),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Socket-Id'],
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
