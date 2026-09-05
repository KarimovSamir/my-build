import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

/** Значения, которые принимает `?unread=`. */
const UNREAD_VALUES = ['true', 'false', '1', '0'] as const;

/**
 * Список уведомлений (`GET /notifications?unread=&page=`, ТЗ §5).
 *
 * `unread` объявлен строкой, а не `boolean`, и это не небрежность. Глобальный
 * `ValidationPipe` включён с `enableImplicitConversion`, а тот приводит
 * значение к объявленному типу раньше любого `@Transform` и сильнее него —
 * проверено тестом рядом. Для `boolean` приведение делается через
 * `Boolean(value)`, где `Boolean('false')` истина: `?unread=false` означал бы
 * ровно обратное написанному, молча и без единой ошибки. Со строкой приведение
 * становится тождественным, и разбор остаётся там, где его видно.
 */
export class ListNotificationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(UNREAD_VALUES, { message: 'Параметр unread принимает true или false' })
  unread?: (typeof UNREAD_VALUES)[number];

  /**
   * Что искать: `true` — только непрочитанные, `false` — только прочитанные,
   * `undefined` — фильтра нет. Геттер живёт на прототипе, поэтому `whitelist`
   * его не срезает.
   */
  get unreadOnly(): boolean | undefined {
    if (this.unread === undefined) return undefined;

    return this.unread === 'true' || this.unread === '1';
  }
}
