import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  Max,
} from 'class-validator';

import { MONEY_PATTERN, ORDER_LIMITS, ObjectType, OrderCategory } from '@mybuild/shared';

import { optionalText, trim } from '../../../common/dto/transforms.js';
import { IsNotPastDate } from '../../../common/validators/is-not-past-date.js';

/**
 * Создание заказа (`POST /orders`, ТЗ §4.1).
 *
 * Запрос приходит как multipart — вместе с файлами, — поэтому все значения
 * доезжают строками, и преобразование задано явно, а не оставлено на догадки
 * ValidationPipe. `price` и `deadline` в форме отсутствуют: они появляются
 * только при принятии предложения (ТЗ §3).
 *
 * Тексты ошибок русские: они показываются пользователю под полем формы (ТЗ §7).
 */

export class CreateOrderDto {
  @IsString()
  @trim()
  @Length(ORDER_LIMITS.title.min, ORDER_LIMITS.title.max, {
    message: `Название заказа — от ${ORDER_LIMITS.title.min} до ${ORDER_LIMITS.title.max} символов`,
  })
  title!: string;

  @IsEnum(OrderCategory, { message: 'Выберите категорию заказа' })
  category!: OrderCategory;

  @IsEnum(ObjectType, { message: 'Выберите тип объекта' })
  objectType!: ObjectType;

  @IsString()
  @trim()
  @Length(ORDER_LIMITS.description.min, ORDER_LIMITS.description.max, {
    message: `Описание работ — от ${ORDER_LIMITS.description.min} до ${ORDER_LIMITS.description.max} символов`,
  })
  description!: string;

  @IsString()
  @trim()
  @Length(ORDER_LIMITS.address.min, ORDER_LIMITS.address.max, {
    message: `Адрес объекта — от ${ORDER_LIMITS.address.min} до ${ORDER_LIMITS.address.max} символов`,
  })
  address!: string;

  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: ORDER_LIMITS.squareMeters.maxDecimals },
    { message: 'Площадь — число, не более двух знаков после запятой' },
  )
  @IsPositive({ message: 'Площадь должна быть больше нуля' })
  @Max(ORDER_LIMITS.squareMeters.max, {
    message: 'Площадь не может быть больше 1 000 000 м²',
  })
  squareMeters!: number;

  /** Ожидание клиента, а не цена сделки. Строкой — чтобы не терять копейки. */
  @IsOptional()
  @optionalText()
  @Matches(MONEY_PATTERN, { message: 'Бюджет — сумма вида 150000 или 150000.50' })
  clientBudget?: string;

  /** Дата в формате ISO-8601 (`2026-10-01`). В `Date` превращает сервис. */
  @IsOptional()
  @optionalText()
  @IsDateString({}, { message: 'Некорректная желаемая дата начала' })
  @IsNotPastDate({ message: 'Желаемая дата начала не может быть в прошлом' })
  desiredStartDate?: string;
}
