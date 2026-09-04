import { Transform, Type } from 'class-transformer';
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
  registerDecorator,
  ValidatorConstraint,
  type ValidationOptions,
  type ValidatorConstraintInterface,
} from 'class-validator';

import { MONEY_PATTERN, ORDER_LIMITS, ObjectType, OrderCategory } from '@mybuild/shared';

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

/** Обрезает пробелы по краям. */
const trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

/**
 * Пустая строка в multipart означает «поле не заполнено».
 * Браузер отправляет незаполненные поля формы именно так, а не пропускает их.
 */
const optionalField = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value ?? undefined;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  });

/**
 * Сегодняшний день по UTC.
 *
 * Сравниваем именно даты, а не моменты: клиент выбирает день в календаре,
 * и «сегодня» не должно отваливаться из-за времени суток.
 *
 * Граница одна для всех часовых поясов, и это осознанное упрощение: восточнее
 * Гринвича проверка мягче (вчерашний по UTC день ещё принимается), западнее —
 * строже (свой сегодняшний день недоступен, пока в UTC не наступит завтра).
 * Календарь на форме отключает ровно те же дни, поэтому фронт и backend
 * не расходятся и пользователь не видит отказа на дате, которую ему предложили.
 */
function startOfUtcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Дата не в прошлом.
 *
 * Своя проверка, а не `@MinDate`: тот работает только с полем типа `Date`,
 * а дата приходит строкой. Объявить поле как `Date` тоже нельзя — глобальный
 * `enableImplicitConversion` превращает пустую строку в `Invalid Date` раньше,
 * чем до неё доходит любое собственное преобразование, и незаполненное поле
 * формы становилось бы ошибкой валидации.
 */
@ValidatorConstraint({ name: 'isNotPastDate' })
class IsNotPastDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;

    const parsed = new Date(value);
    return (
      !Number.isNaN(parsed.getTime()) && parsed.getTime() >= startOfUtcToday().getTime()
    );
  }

  defaultMessage(): string {
    return 'Желаемая дата начала не может быть в прошлом';
  }
}

const IsNotPastDate =
  (options?: ValidationOptions) => (object: object, propertyName: string) =>
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      validator: IsNotPastDateConstraint,
    });

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
  @optionalField()
  @Matches(MONEY_PATTERN, { message: 'Бюджет — сумма вида 150000 или 150000.50' })
  clientBudget?: string;

  /** Дата в формате ISO-8601 (`2026-10-01`). В `Date` превращает сервис. */
  @IsOptional()
  @optionalField()
  @IsDateString({}, { message: 'Некорректная желаемая дата начала' })
  @IsNotPastDate()
  desiredStartDate?: string;
}
