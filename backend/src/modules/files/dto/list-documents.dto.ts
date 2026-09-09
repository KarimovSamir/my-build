import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { FileOwnerType } from '@mybuild/shared';

import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

/**
 * Раздел «Документы» (`GET /documents?ownerType=&orderId=&page=`, ТЗ §5).
 *
 * Оба фильтра объявлены строками (enum и UUID) — приведение типов глобального
 * `ValidationPipe` их не трогает, в отличие от `boolean` и `Date`
 * (см. `list-notifications.dto.ts`).
 *
 * `orderId` проверяется как UUID до похода в базу: колонка `OrderFile.orderId`
 * имеет тип `uuid`, и мусор в фильтре уронил бы запрос в Postgres, то есть
 * ушёл бы наружу как 500 вместо честного 400.
 */
export class ListDocumentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(FileOwnerType, { message: 'Владелец файла — CLIENT или COMPANY' })
  ownerType?: FileOwnerType;

  @IsOptional()
  @IsUUID('all', { message: 'Идентификатор заказа указан неверно' })
  orderId?: string;
}
