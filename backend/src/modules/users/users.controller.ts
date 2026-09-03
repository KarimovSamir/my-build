import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';

import type { UserProfile } from '@mybuild/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Throttle } from '../../common/decorators/throttle.decorator.js';
import { ThrottleGuard } from '../../common/guards/throttle.guard.js';
import type { AuthUser } from '../auth/auth-user.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UsersService } from './users.service.js';

/**
 * Профиль текущего пользователя (ТЗ §5). Доступен обеим ролям: каждый видит
 * и меняет только себя — идентификатор берётся из токена, а не из запроса.
 */
@Controller('profile')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  getProfile(@CurrentUser() user: AuthUser): Promise<UserProfile> {
    return this.users.getProfile(user.id);
  }

  /** Мутирующий маршрут — под ограничением частоты (ТЗ §6). */
  @Patch()
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 20, ttl: 60_000 })
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfile> {
    return this.users.updateProfile(user.id, dto);
  }
}
