-- Ревизия после закрытия audit.md (находка R2-С2): данные профиля не проверял
-- никто, кроме формы в браузере.
--
-- Профиль создаётся только здесь. Регистрация идёт `supabase.auth.signUp`
-- с публикуемым ключом, то есть мимо backend: прямой запрос к /auth/v1/signup
-- клал в public."User" телефон произвольного вида и имя произвольной длины —
-- колонки объявлены как text, верхней границы у них нет. Правила из
-- shared/src/profile.ts (PHONE_PATTERN, PROFILE_LIMITS) применялись только
-- формой и DTO `PATCH /profile`, то есть на единственном пути создания профиля
-- не применялись вовсе.
--
-- Триггер — единственная серверная точка на этом пути, поэтому проверки живут
-- здесь. Числа те же, что в shared/src/profile.ts; расходиться они не должны.
--
-- Правило прежнее: неверные метаданные — это исключение, оно отменяет вставку
-- в auth.users целиком. Состояние «учётная запись есть, профиля нет» остаётся
-- невозможным по построению (ТЗ §3).

CREATE OR REPLACE FUNCTION public.handle_auth_user_upsert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  meta         jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  user_role    text  := upper(coalesce(meta->>'role', ''));
  first_name   text  := nullif(btrim(coalesce(meta->>'firstName', '')), '');
  last_name    text  := nullif(btrim(coalesce(meta->>'lastName', '')), '');
  phone        text  := nullif(btrim(coalesce(meta->>'phone', '')), '');
  company_name text  := nullif(btrim(coalesce(meta->>'companyName', '')), '');
  city         text  := nullif(btrim(coalesce(meta->>'city', '')), '');
  country      text  := nullif(btrim(coalesce(meta->>'country', '')), '');
BEGIN
  IF NEW.email IS NULL THEN
    RAISE EXCEPTION 'Профиль MyBuild требует email: вход по телефону не поддерживается';
  END IF;

  IF user_role NOT IN ('CLIENT', 'COMPANY') THEN
    RAISE EXCEPTION 'Профиль MyBuild требует role = CLIENT или COMPANY в метаданных регистрации';
  END IF;

  IF first_name IS NULL THEN
    RAISE EXCEPTION 'Профиль MyBuild требует firstName в метаданных регистрации';
  END IF;

  IF phone IS NULL THEN
    RAISE EXCEPTION 'Профиль MyBuild требует phone в метаданных регистрации';
  END IF;

  IF user_role = 'COMPANY' AND company_name IS NULL THEN
    RAISE EXCEPTION 'Профиль компании требует companyName в метаданных регистрации';
  END IF;

  -- ─── Формат телефона (shared/src/profile.ts, PHONE_PATTERN) ───────────────
  -- Строже проверять нельзя: формат номера различается по странам, а ТЗ §3
  -- хранит его строкой как есть. Поэтому — только допустимые символы
  -- и количество цифр. Проверка разбита на два условия, потому что в regexp
  -- Postgres нет просмотра вперёд, которым это записано в JavaScript.
  IF char_length(phone) > 30 THEN
    RAISE EXCEPTION 'Телефон длиннее 30 символов';
  END IF;

  IF phone !~ '^\+?[0-9 ()-]+$' THEN
    RAISE EXCEPTION 'Телефон указан неверно. Пример: +7 900 000-00-00';
  END IF;

  IF char_length(regexp_replace(phone, '[^0-9]', '', 'g')) NOT BETWEEN 10 AND 15 THEN
    RAISE EXCEPTION 'Телефон указан неверно. Пример: +7 900 000-00-00';
  END IF;

  -- ─── Длины текстовых полей (shared/src/profile.ts, PROFILE_LIMITS) ────────
  IF char_length(first_name) > 100 THEN
    RAISE EXCEPTION 'Имя длиннее 100 символов';
  END IF;

  IF last_name IS NOT NULL AND char_length(last_name) > 100 THEN
    RAISE EXCEPTION 'Фамилия длиннее 100 символов';
  END IF;

  IF city IS NOT NULL AND char_length(city) > 100 THEN
    RAISE EXCEPTION 'Город длиннее 100 символов';
  END IF;

  IF country IS NOT NULL AND char_length(country) > 100 THEN
    RAISE EXCEPTION 'Страна длиннее 100 символов';
  END IF;

  IF company_name IS NOT NULL AND char_length(company_name) > 200 THEN
    RAISE EXCEPTION 'Название компании длиннее 200 символов';
  END IF;

  INSERT INTO public."User" (
    id, email, "role", "firstName", "lastName", phone,
    "companyName", city, country, "createdAt", "updatedAt"
  )
  VALUES (
    NEW.id,
    NEW.email,
    user_role::public."Role",
    first_name,
    last_name,
    phone,
    -- У клиента поле пустое даже если что-то пришло в метаданных.
    CASE WHEN user_role = 'COMPANY' THEN company_name END,
    city,
    country,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
    SET email       = EXCLUDED.email,
        "updatedAt" = now();

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_auth_user_upsert() FROM public, anon, authenticated;
