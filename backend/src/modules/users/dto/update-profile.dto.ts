import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { PHONE_ERROR_MESSAGE, PHONE_MAX_LENGTH, PHONE_PATTERN } from '@mybuild/shared';

/** Обрезает пробелы по краям: ' Анна ' и 'Анна' — это одно и то же имя. */
const trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

/**
 * Изменение профиля (`PATCH /profile`, ТЗ §5).
 *
 * Email и пароль сюда не входят: их меняет Supabase Auth через SDK на фронте.
 * Роль не меняется вообще — от неё зависит вся модель доступа.
 *
 * Незаданные поля не трогаются. Пустая строка в необязательном поле означает
 * «очистить»; в обязательном — ошибка валидации.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @trim()
  @IsNotEmpty({ message: 'Имя не может быть пустым' })
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @trim()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @trim()
  @IsNotEmpty({ message: 'Телефон не может быть пустым' })
  @MaxLength(PHONE_MAX_LENGTH)
  @Matches(PHONE_PATTERN, { message: PHONE_ERROR_MESSAGE })
  phone?: string;

  @IsOptional()
  @IsString()
  @trim()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @trim()
  @MaxLength(100)
  country?: string;

  /** Только для роли COMPANY и очистке не подлежит (ТЗ §3). */
  @IsOptional()
  @IsString()
  @trim()
  @MaxLength(200)
  companyName?: string;
}
