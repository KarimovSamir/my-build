/**
 * Правила формы профиля (`PATCH /profile`, ТЗ §5, §7).
 *
 * Зеркало `UpdateProfileDto`: пределы длины и формат телефона берутся
 * из `shared/`, поэтому форма и backend не могут разойтись в том, что считать
 * допустимым. Проверка здесь — про удобство (ошибка под полем вместо ответа
 * 400), а не про безопасность: решает всё равно backend.
 *
 * Email и пароль сюда не входят: их меняет Supabase Auth, а не наше API
 * (`password-form.ts`). Роль не меняется вообще — от неё зависит вся модель
 * доступа.
 *
 * Модуль чистый — ни React, ни fetch.
 */

import {
  PHONE_ERROR_MESSAGE,
  PROFILE_LIMITS,
  Role,
  isValidPhone,
  type UserProfile,
} from "@/lib/types";

/** Значения полей формы. Всё строками: пустое поле — это «», а не `null`. */
export interface ProfileFormValues {
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  country: string;
  /** Только у роли COMPANY; у клиента поля нет и в форме. */
  companyName: string;
}

export type ProfileFormField = keyof ProfileFormValues;

export type ProfileFormErrors = Partial<Record<ProfileFormField, string>>;

/** Профиль из API → значения формы: незаполненное поле приходит как `null`. */
export function toProfileForm(profile: UserProfile): ProfileFormValues {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName ?? "",
    phone: profile.phone,
    city: profile.city ?? "",
    country: profile.country ?? "",
    companyName: profile.companyName ?? "",
  };
}

/**
 * Проверка всей формы. Пустой объект — можно отправлять.
 *
 * Роль нужна из-за названия компании: у COMPANY оно обязательно и очистке
 * не подлежит (ТЗ §3), у клиента его не существует вовсе.
 */
export function validateProfileForm(
  values: ProfileFormValues,
  role: Role,
): ProfileFormErrors {
  const errors: ProfileFormErrors = {};

  const firstName = values.firstName.trim();
  if (!firstName) {
    errors.firstName = "Укажите имя";
  } else if (firstName.length > PROFILE_LIMITS.firstName) {
    errors.firstName = tooLong("Имя", PROFILE_LIMITS.firstName);
  }

  if (values.lastName.trim().length > PROFILE_LIMITS.lastName) {
    errors.lastName = tooLong("Фамилия", PROFILE_LIMITS.lastName);
  }

  const phone = values.phone.trim();
  if (!phone) {
    errors.phone = "Укажите телефон";
  } else if (!isValidPhone(phone)) {
    errors.phone = PHONE_ERROR_MESSAGE;
  }

  if (values.city.trim().length > PROFILE_LIMITS.city) {
    errors.city = tooLong("Город", PROFILE_LIMITS.city);
  }

  if (values.country.trim().length > PROFILE_LIMITS.country) {
    errors.country = tooLong("Страна", PROFILE_LIMITS.country);
  }

  if (role === Role.COMPANY) {
    const companyName = values.companyName.trim();

    if (!companyName) {
      errors.companyName = "Укажите название компании";
    } else if (companyName.length > PROFILE_LIMITS.companyName) {
      errors.companyName = tooLong("Название компании", PROFILE_LIMITS.companyName);
    }
  }

  return errors;
}

/** Тело запроса `PATCH /profile`. */
export interface ProfileRequestBody {
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  country: string;
  companyName?: string;
}

/**
 * Тело запроса из значений формы.
 *
 * Необязательные поля уходят пустой строкой, а не пропускаются: пустая строка
 * там означает «очистить», и без неё стёртый пользователем город остался бы
 * в базе прежним.
 *
 * Название компании клиента не отправляется вовсе: у роли CLIENT оно
 * запрещено, и `PATCH /profile` ответил бы на него 400.
 */
export function toProfileBody(values: ProfileFormValues, role: Role): ProfileRequestBody {
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    phone: values.phone.trim(),
    city: values.city.trim(),
    country: values.country.trim(),
    ...(role === Role.COMPANY ? { companyName: values.companyName.trim() } : {}),
  };
}

/**
 * Отличаются ли значения формы от сохранённого профиля.
 *
 * По этому признаку гаснет кнопка «Сохранить»: запрос, который ничего
 * не меняет, всё равно потратил бы лимит частоты и показал бы тост об успехе
 * там, где ничего не произошло. Сравнение по обрезанным строкам — те же
 * значения уходят в тело запроса.
 */
export function isProfileChanged(
  values: ProfileFormValues,
  profile: UserProfile,
): boolean {
  const saved = toProfileForm(profile);

  return (Object.keys(saved) as ProfileFormField[]).some(
    (field) => values[field].trim() !== saved[field].trim(),
  );
}

function tooLong(label: string, max: number): string {
  return `${label} — не более ${max} символов`;
}
