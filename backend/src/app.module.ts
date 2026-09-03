import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './config/env.validation.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { UsersModule } from './modules/users/users.module.js';
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
    // Идёт раньше остальных: регистрирует глобальные guard'ы, которыми
    // закрыты все маршруты, кроме помеченных @Public().
    AuthModule,
    HealthModule,
    UsersModule,
    FilesModule,
    OrdersModule,
  ],
})
export class AppModule {}
