import { IsEnum, IsIn, IsOptional } from 'class-validator';

import { OfferStatus } from '@mybuild/shared';

import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

/** Значения, которые принимает `?executor=`. */
const EXECUTOR_VALUES = ['true', 'false', '1', '0'] as const;

/**
 * Свои предложения компании (`GET /company/offers?status=&page=`, ТЗ §5).
 *
 * Поиска здесь нет: список короткий и разбирается вкладками статусов,
 * как на экране заказов клиента.
 *
 * `executor` в ТЗ не значится — его просит раздел «Документы» (ТЗ §7): там
 * нужны заказы, где компания стала исполнителем, а отобрать их из страницы
 * всех предложений нельзя. Отсев после пагинации оставлял бы фильтр пустым
 * у компании, у которой предложений больше страницы.
 *
 * Строкой, а не `boolean`, по той же причине, что и `?unread=` у уведомлений:
 * `enableImplicitConversion` привёл бы значение через `Boolean('false')`, то
 * есть `?executor=false` означал бы обратное написанному.
 */
export class ListCompanyOffersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OfferStatus, { message: 'Неизвестный статус предложения' })
  status?: OfferStatus;

  @IsOptional()
  @IsIn(EXECUTOR_VALUES, { message: 'Параметр executor принимает true или false' })
  executor?: (typeof EXECUTOR_VALUES)[number];

  /**
   * `true` — только заказы, где компания исполнитель, `false` — только
   * остальные, `undefined` — фильтра нет. Геттер живёт на прототипе, поэтому
   * `whitelist` его не срезает.
   */
  get executorOnly(): boolean | undefined {
    if (this.executor === undefined) return undefined;

    return this.executor === 'true' || this.executor === '1';
  }
}
