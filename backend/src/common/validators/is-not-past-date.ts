import {
  registerDecorator,
  ValidatorConstraint,
  type ValidationOptions,
  type ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Дата не в прошлом. Используется желаемой датой начала заказа и предлагаемым
 * сроком выполнения в предложении компании (ТЗ §4.1).
 *
 * Своя проверка, а не `@MinDate`: тот работает только с полем типа `Date`,
 * а дата приходит строкой. Объявить поле как `Date` тоже нельзя — глобальный
 * `enableImplicitConversion` превращает пустую строку в `Invalid Date` раньше,
 * чем до неё доходит любое собственное преобразование, и незаполненное поле
 * формы становилось бы ошибкой валидации.
 */

/**
 * Сегодняшний день по UTC.
 *
 * Сравниваем именно даты, а не моменты: пользователь выбирает день
 * в календаре, и «сегодня» не должно отваливаться из-за времени суток.
 *
 * Граница одна для всех часовых поясов, и это осознанное упрощение: восточнее
 * Гринвича проверка мягче (вчерашний по UTC день ещё принимается), западнее —
 * строже (свой сегодняшний день недоступен, пока в UTC не наступит завтра).
 * Календарь на форме отключает ровно те же дни, поэтому фронт и backend
 * не расходятся и пользователь не видит отказа на дате, которую ему предложили.
 */
export function startOfUtcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

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
    return 'Дата не может быть в прошлом';
  }
}

export const IsNotPastDate =
  (options?: ValidationOptions) => (object: object, propertyName: string) =>
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      validator: IsNotPastDateConstraint,
    });
