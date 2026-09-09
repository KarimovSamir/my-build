import { Module } from '@nestjs/common';

import { ThrottleGuard } from '../../common/guards/throttle.guard.js';
import { ContractorsController } from './contractors.controller.js';
import { ContractorsService } from './contractors.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

/**
 * Пользователи: профиль текущего (`/profile`) и каталог подрядчиков
 * (`/contractors`, только для клиента).
 *
 * `ThrottleGuard` объявлен провайдером: он висит на `PATCH /profile`
 * и на `ContractorsController` через `@UseGuards`, а окна у него свои
 * на каждый экземпляр.
 */
@Module({
  controllers: [UsersController, ContractorsController],
  providers: [UsersService, ContractorsService, ThrottleGuard],
  exports: [UsersService],
})
export class UsersModule {}
