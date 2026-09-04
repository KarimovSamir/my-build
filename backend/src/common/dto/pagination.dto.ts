import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { DEFAULT_PAGE_SIZE, MAX_PAGE, MAX_PAGE_SIZE } from '@mybuild/shared';

/**
 * Общие параметры любого списка (ТЗ §5: пагинация обязательна везде).
 *
 * Вынесено в базовый класс, потому что границы здесь не косметические:
 * `pageSize` без потолка сводит пагинацию на нет, а `page` превращается
 * в `skip = (page - 1) * pageSize`, и `page=1e20` даёт значение, которое
 * Prisma принимать отказывается, — то есть 500 вместо пустой страницы.
 * Повтори эти правила каждый список по-своему — рано или поздно один из них
 * их потеряет.
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Номер страницы — целое число' })
  @Min(1)
  @Max(MAX_PAGE, { message: 'Такой страницы не существует' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Размер страницы — целое число' })
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;
}

/** Длина поисковой строки: больше двухсот символов ищут только скриптом. */
export const MAX_SEARCH_LENGTH = 200;

/** Список с поиском строкой. Что именно ищется — решает конкретный маршрут. */
export class SearchQueryDto extends PaginationQueryDto {
  @IsOptional()
  // Пустой запрос — это отсутствие запроса, а не поиск пустой строки:
  // иначе поле поиска, из которого всё стёрли, отдавало бы `contains: ''`.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  q?: string;
}
