import { IsEnum, IsOptional } from 'class-validator';

import { OfferStatus } from '@mybuild/shared';

import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

/**
 * Свои предложения компании (`GET /company/offers?status=&page=`, ТЗ §5).
 *
 * Поиска здесь нет: список короткий и разбирается вкладками статусов,
 * как на экране заказов клиента.
 */
export class ListCompanyOffersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OfferStatus, { message: 'Неизвестный статус предложения' })
  status?: OfferStatus;
}
