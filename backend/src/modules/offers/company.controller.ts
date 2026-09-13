import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import {
  Role,
  type AvailableOrderItem,
  type CompanyOfferItem,
  type Paginated,
} from '@mybuild/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { SearchQueryDto } from '../../common/dto/pagination.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Throttle } from '../../common/decorators/throttle.decorator.js';
import { ThrottleGuard } from '../../common/guards/throttle.guard.js';
import type { AuthUser } from '../auth/auth-user.js';
import { ListCompanyOffersQueryDto } from './dto/list-company-offers.dto.js';
import { OffersService } from './offers.service.js';

/**
 * Кабинет компании (ТЗ §5): лента доступных заказов и свои предложения.
 *
 * Оба маршрута только для роли `COMPANY` — клиенту здесь смотреть нечего,
 * а лента вдобавок строится вокруг его собственных предложений.
 *
 * `ThrottleGuard` стоит на контроллере целиком, хотя оба маршрута только
 * читают (ТЗ §6 требует ограничитель на мутирующих): лента — самый дорогой
 * запрос кабинета компании, `COUNT` и выборка идут по всем заказам площадки,
 * а с `?q=` ещё и `LIKE '%…%'`. Лимит общий на оба и с запасом на обычную
 * работу: списки перечитываются на каждое событие сокета.
 */
@Controller('company')
@UseGuards(ThrottleGuard)
@Throttle({ limit: 120, ttl: 60_000 })
@Roles(Role.COMPANY)
export class CompanyController {
  constructor(private readonly offers: OffersService) {}

  /** Заказы, по которым эта компания может подать предложение (ТЗ §4.1). */
  @Get('orders/available')
  availableOrders(
    @CurrentUser() user: AuthUser,
    @Query() query: SearchQueryDto,
  ): Promise<Paginated<AvailableOrderItem>> {
    return this.offers.listAvailableOrders(user.id, query);
  }

  /** Свои предложения по статусам. */
  @Get('offers')
  ownOffers(
    @CurrentUser() user: AuthUser,
    @Query() query: ListCompanyOffersQueryDto,
  ): Promise<Paginated<CompanyOfferItem>> {
    return this.offers.listOwnOffers(user.id, query);
  }
}
