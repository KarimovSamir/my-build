import { IsDateString, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

import { OFFER_LIMITS, OFFER_PRICE_PATTERN } from '@mybuild/shared';

import { optionalText } from '../../../common/dto/transforms.js';
import { IsNotPastDate } from '../../../common/validators/is-not-past-date.js';

/**
 * Отправка предложения (`POST /offers`, ТЗ §4.1).
 *
 * Маршрут один и на первую отправку, и на обновление: одна компания подаёт
 * по заказу ровно одно предложение (`@@unique([orderId, companyId])`), поэтому
 * идентификатор предложения в запросе не нужен — достаточно заказа.
 *
 * Тексты ошибок русские: они показываются пользователю под полем формы (ТЗ §7).
 */

export class CreateOfferDto {
  @IsUUID('4', { message: 'Некорректный заказ' })
  orderId!: string;

  /** Строкой — чтобы не терять копейки на числах с плавающей точкой. */
  @Matches(OFFER_PRICE_PATTERN, {
    message: 'Цена — сумма больше нуля, вида 150000 или 150000.50',
  })
  proposedPrice!: string;

  /**
   * Дата завершения работ в формате ISO-8601. В `Date` превращает сервис —
   * по той же причине, что и в заказе: глобальный `enableImplicitConversion`
   * ломает поля типа `Date`, приходящие строкой.
   */
  @IsDateString({}, { message: 'Некорректный срок выполнения' })
  @IsNotPastDate({ message: 'Срок выполнения не может быть в прошлом' })
  proposedDeadline!: string;

  @IsOptional()
  @optionalText()
  @IsString()
  @MaxLength(OFFER_LIMITS.comment.max, {
    message: `Комментарий — не более ${OFFER_LIMITS.comment.max} символов`,
  })
  comment?: string;
}
