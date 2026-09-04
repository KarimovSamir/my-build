import { IsString, Length } from 'class-validator';

import { ORDER_LIMITS } from '@mybuild/shared';

import { trim } from '../../../common/dto/transforms.js';

/**
 * Файлы сдачи от компании (`POST /orders/:id/files`, ТЗ §4.1).
 *
 * Комментарий обязателен — так требует ТЗ: клиент должен понимать, что именно
 * ему прислали. Обязательность хотя бы одного файла проверяет не DTO, а сервис:
 * файлы приходят не в теле, а отдельной частью multipart.
 */
export class SubmitFilesDto {
  @IsString({ message: 'Добавьте комментарий к файлам' })
  @trim()
  @Length(ORDER_LIMITS.comment.min, ORDER_LIMITS.comment.max, {
    message: `Комментарий — от ${ORDER_LIMITS.comment.min} до ${ORDER_LIMITS.comment.max} символов`,
  })
  comment!: string;
}
