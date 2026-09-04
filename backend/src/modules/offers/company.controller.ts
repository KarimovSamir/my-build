import { Controller, Get, Query } from '@nestjs/common';

import {
  Role,
  type CompanyOfferItem,
  type OrderListItem,
  type Paginated,
} from '@mybuild/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { SearchQueryDto } from '../../common/dto/pagination.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../auth/auth-user.js';
import { ListCompanyOffersQueryDto } from './dto/list-company-offers.dto.js';
import { OffersService } from './offers.service.js';

/**
 * Кабинет компании (ТЗ §5): лента доступных заказов и свои предложения.
 *
 * Оба маршрута только для роли `COMPANY` — клиенту здесь смотреть нечего,
 * а лента вдобавок строится вокруг его собственных предложений.
 */
@Controller('company')
@Roles(Role.COMPANY)
export class CompanyController {
  constructor(private readonly offers: OffersService) {}

  /** Заказы, по которым эта компания может подать предложение (ТЗ §4.1). */
  @Get('orders/available')
  availableOrders(
    @CurrentUser() user: AuthUser,
    @Query() query: SearchQueryDto,
  ): Promise<Paginated<OrderListItem>> {
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
