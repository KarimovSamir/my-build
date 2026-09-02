import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const port = config.get<number>('PORT', 4000);

  await app.listen(port);

  logger.log(`API слушает http://localhost:${port}`);
  logger.log(`Health-check: http://localhost:${port}/health`);
}

await bootstrap();
