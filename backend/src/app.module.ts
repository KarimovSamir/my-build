import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './config/env.validation.js';
import { HealthModule } from './modules/health/health.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    OrdersModule,
  ],
})
export class AppModule {}
