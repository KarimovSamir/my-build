import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { Role, type OfferDto } from '@mybuild/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Throttle } from '../../common/decorators/throttle.decorator.js';
import { ThrottleGuard } from '../../common/guards/throttle.guard.js';
import type { AuthUser } from '../auth/auth-user.js';
import { CreateOfferDto } from './dto/create-offer.dto.js';
import { OffersService } from './offers.service.js';

/**
 * Предложения по заказу (ТЗ §5).
 *
 * `:id` здесь — идентификатор предложения, а не заказа, поэтому `OwnershipGuard`
 * не подходит: он ищет по `:id` заказ. Право на предложение проверяет сервис
 * одним запросом, который всё равно нужен для перехода.
 *
 * Все три маршрута мутирующие и закрыты ограничителем частоты (ТЗ §6).
 */
@Controller('offers')
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  /**
   * Отправить предложение по заказу. Повторный запрос обновляет уже поданное
   * и возвращает его в `SENT` (ТЗ §4.1, семантика upsert), поэтому отдельного
   * маршрута на изменение нет.
   */
  @Post()
  @Roles(Role.COMPANY)
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 30, ttl: 60_000 })
  submit(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOfferDto,
  ): Promise<OfferDto> {
    return this.offers.submit(user.id, dto);
  }

  /** Компания отзывает своё предложение. */
  @Post(':id/withdraw')
  @Roles(Role.COMPANY)
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 30, ttl: 60_000 })
  // Ничего не создаётся — 200, а не принятый в Nest по умолчанию 201.
  @HttpCode(HttpStatus.OK)
  withdraw(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<OfferDto> {
    return this.offers.withdraw(user.id, id);
  }

  /** Клиент отклоняет предложение по своему заказу. */
  @Post(':id/reject')
  @Roles(Role.CLIENT)
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 30, ttl: 60_000 })
  @HttpCode(HttpStatus.OK)
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<OfferDto> {
    return this.offers.reject(user.id, id);
  }
}
