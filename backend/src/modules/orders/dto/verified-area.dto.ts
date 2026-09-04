import { Type } from 'class-transformer';
import { IsNumber, IsPositive, Max } from 'class-validator';

import { ORDER_LIMITS } from '@mybuild/shared';

/**
 * Уточнение площади исполнителем (`PATCH /orders/:id/verified-area`, ТЗ §4.1).
 *
 * Границы те же, что и у площади в заказе: это одна и та же величина, просто
 * посчитанная другой стороной. Исходное `squareMeters` клиента при этом
 * не перезаписывается — в интерфейсе показываются оба значения.
 */
export class VerifiedAreaDto {
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: ORDER_LIMITS.squareMeters.maxDecimals },
    { message: 'Площадь — число, не более двух знаков после запятой' },
  )
  @IsPositive({ message: 'Площадь должна быть больше нуля' })
  @Max(ORDER_LIMITS.squareMeters.max, {
    message: 'Площадь не может быть больше 1 000 000 м²',
  })
  verifiedSquareMeters!: number;
}
