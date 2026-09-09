import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { Role, type ContractorCard, type Paginated } from '@mybuild/shared';

import { Roles } from '../../common/decorators/roles.decorator.js';
import { Throttle } from '../../common/decorators/throttle.decorator.js';
import { SearchQueryDto } from '../../common/dto/pagination.dto.js';
import { ThrottleGuard } from '../../common/guards/throttle.guard.js';
import { ContractorsService } from './contractors.service.js';

/**
 * Каталог подрядчиков (ТЗ §5) — только для роли `CLIENT`.
 *
 * Компании здесь смотреть нечего: раздел существует, чтобы заказчик знал,
 * кто есть на площадке, а компании он отдавал бы контакты конкурентов
 * одним запросом. В боковом меню его у компании тоже нет (ТЗ §7).
 *
 * `ThrottleGuard` на контроллере, хотя маршруты только читают: каталог отдаёт
 * телефоны и адреса всех компаний, и без ограничителя выгрузить его целиком
 * не составляло бы труда.
 */
@UseGuards(ThrottleGuard)
@Throttle({ limit: 60, ttl: 60_000 })
@Roles(Role.CLIENT)
@Controller('contractors')
export class ContractorsController {
  constructor(private readonly contractors: ContractorsService) {}

  /** Список компаний с поиском по названию и городу. */
  @Get()
  list(@Query() query: SearchQueryDto): Promise<Paginated<ContractorCard>> {
    return this.contractors.list(query);
  }

  /** Карточка компании: название, город, контакты, число завершённых заказов. */
  @Get(':id')
  getById(@Param('id') contractorId: string): Promise<ContractorCard> {
    return this.contractors.getById(contractorId);
  }
}
