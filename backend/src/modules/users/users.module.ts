import { Module } from '@nestjs/common';

import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

/**
 * Пользователи. Пока это только профиль; каталог подрядчиков (`/contractors`)
 * добавится сюда же в Фазе 6 (ТЗ §10).
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
