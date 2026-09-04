import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

import { ORDER_LIMITS } from '@mybuild/shared';

import { optionalText, trim } from '../../../common/dto/transforms.js';

/**
 * Решение клиента по сданной работе (ТЗ §4, §5).
 *
 * Два DTO в одном файле: это две половины одной развилки — принять или вернуть.
 * Разница между ними ровно в обязательности комментария, и держать её видимой
 * в одном месте полезнее, чем разносить по двум файлам.
 */

/** `POST /orders/:id/confirm` — комментарий по желанию. */
export class ConfirmOrderDto {
  @IsOptional()
  @optionalText()
  @IsString()
  @MaxLength(ORDER_LIMITS.comment.max, {
    message: `Комментарий — не более ${ORDER_LIMITS.comment.max} символов`,
  })
  comment?: string;
}

/**
 * `POST /orders/:id/dispute` — комментарий обязателен: он и есть содержание
 * доработки, без него компания не узнает, что переделывать (ТЗ §4).
 */
export class DisputeOrderDto {
  @IsString({ message: 'Опишите, что нужно доработать' })
  @trim()
  @Length(ORDER_LIMITS.comment.min, ORDER_LIMITS.comment.max, {
    message: `Комментарий — от ${ORDER_LIMITS.comment.min} до ${ORDER_LIMITS.comment.max} символов`,
  })
  correctionComment!: string;
}
