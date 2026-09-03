import { Module } from '@nestjs/common';

import { ThrottleGuard } from '../../common/guards/throttle.guard.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

/**
 * Пользователи. Пока это только профиль; каталог подрядчиков (`/contractors`)
 * добавится сюда же в Фазе 6 (ТЗ §10).
 *
 * `ThrottleGuard` объявлен провайдером: он висит на `PATCH /profile`
 * через `@UseGuards`.
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService, ThrottleGuard],
  exports: [UsersService],
})
export class UsersModule {}
