import { IsEnum, IsOptional } from 'class-validator';

import { OrderStatus } from '@mybuild/shared';

import { SearchQueryDto } from '../../../common/dto/pagination.dto.js';

/**
 * Параметры списка заказов (`GET /orders?status=&q=&page=`, ТЗ §4.1).
 *
 * Пагинация и поисковая строка — общие для всех списков и живут в
 * `SearchQueryDto`; здесь остаётся только то, что относится именно к заказам.
 * Наследуемое поле `q` ищет по номеру заказа (`ORD-7829` или `7829`), названию
 * заказа и названию подрядчика.
 */
export class ListOrdersQueryDto extends SearchQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus, { message: 'Неизвестный статус заказа' })
  status?: OrderStatus;
}
