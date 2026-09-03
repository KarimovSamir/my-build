import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, OrderStatus } from '@mybuild/shared';

/**
 * Параметры списка заказов (`GET /orders?status=&q=&page=`, ТЗ §4.1).
 *
 * Размер страницы ограничен сверху: иначе клиент попросил бы всё разом,
 * и пагинация перестала бы что-либо значить (ТЗ §5).
 */
export class ListOrdersQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus, { message: 'Неизвестный статус заказа' })
  status?: OrderStatus;

  /** Номер заказа (`ORD-7829` или `7829`), название заказа или подрядчика. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Номер страницы — целое число' })
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Размер страницы — целое число' })
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;
}
