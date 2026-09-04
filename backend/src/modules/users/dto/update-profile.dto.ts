import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { PHONE_ERROR_MESSAGE, PHONE_PATTERN, PROFILE_LIMITS } from '@mybuild/shared';

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
 *
 * Пределы длины берутся из `shared/`: те же числа проверяет триггер
 * `handle_auth_user_upsert`, через который профиль создаётся при регистрации.
 * Разойдись они — форма регистрации пропускала бы то, что потом нельзя
 * сохранить, и наоборот.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @trim()
  @IsNotEmpty({ message: 'Имя не может быть пустым' })
  @MaxLength(PROFILE_LIMITS.firstName)
  firstName?: string;

  @IsOptional()
  @IsString()
  @trim()
  @MaxLength(PROFILE_LIMITS.lastName)
  lastName?: string;

  @IsOptional()
  @IsString()
  @trim()
  @IsNotEmpty({ message: 'Телефон не может быть пустым' })
  @MaxLength(PROFILE_LIMITS.phone)
  @Matches(PHONE_PATTERN, { message: PHONE_ERROR_MESSAGE })
  phone?: string;

  @IsOptional()
  @IsString()
  @trim()
  @MaxLength(PROFILE_LIMITS.city)
  city?: string;

  @IsOptional()
  @IsString()
  @trim()
  @MaxLength(PROFILE_LIMITS.country)
  country?: string;

  /** Только для роли COMPANY и очистке не подлежит (ТЗ §3). */
  @IsOptional()
  @IsString()
  @trim()
  @MaxLength(PROFILE_LIMITS.companyName)
  companyName?: string;
}
