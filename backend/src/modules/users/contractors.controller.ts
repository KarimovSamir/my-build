import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import {
  Role,
  type ContractorCard,
  type ContractorListItem,
  type Paginated,
} from '@mybuild/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Throttle } from '../../common/decorators/throttle.decorator.js';
import { SearchQueryDto } from '../../common/dto/pagination.dto.js';
import { ThrottleGuard } from '../../common/guards/throttle.guard.js';
import type { AuthUser } from '../auth/auth-user.js';
import { ContractorsService } from './contractors.service.js';

/**
 * Каталог подрядчиков (ТЗ §5) — только для роли `CLIENT`.
 *
 * Компании здесь смотреть нечего: раздел существует, чтобы заказчик знал,
 * кто есть на площадке, а компании он отдавал бы контакты конкурентов
 * одним запросом. В боковом меню его у компании тоже нет (ТЗ §7).
 *
 * `ThrottleGuard` на контроллере, хотя маршруты только читают: контакты
 * компании отдаёт карточка, и без ограничителя их собрал бы по площадке
 * обычный цикл по идентификаторам из списка. Сам список контактов не несёт
 * (`ContractorListItem`) — на ограничитель эта защита не перекладывается.
 */
@UseGuards(ThrottleGuard)
@Throttle({ limit: 60, ttl: 60_000 })
@Roles(Role.CLIENT)
@Controller('contractors')
export class ContractorsController {
  constructor(private readonly contractors: ContractorsService) {}

  /** Список компаний с поиском по названию и городу — без контактов. */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: SearchQueryDto,
  ): Promise<Paginated<ContractorListItem>> {
    return this.contractors.list(user, query);
  }

  /** Карточка компании: название, город, контакты, число завершённых заказов. */
  @Get(':id')
  getById(
    @CurrentUser() user: AuthUser,
    @Param('id') contractorId: string,
  ): Promise<ContractorCard> {
    return this.contractors.getById(user, contractorId);
  }
}
