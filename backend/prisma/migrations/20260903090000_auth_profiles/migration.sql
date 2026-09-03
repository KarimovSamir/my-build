-- Фаза 2 (ТЗ §10): профиль public."User" привязывается к учётной записи
-- Supabase Auth, а роль попадает в access-токен отдельным claim'ом.
--
-- Миграция написана руками: ни внешний ключ в чужую схему, ни триггеры,
-- ни CHECK Prisma в схеме выразить не умеет.
--
-- Про shadow-базу. `prisma migrate dev` прогоняет все миграции на пустой
-- временной базе, где схемы auth нет и быть не может — это база Supabase,
-- а не наша. Поэтому ниже, если схемы auth не существует, создаётся минимальная
-- заглушка auth.users. На реальной базе этот блок не срабатывает, а shadow
-- получает ту же структуру, что и прод, и Prisma не видит расхождения.

-- ─── 1. Заглушка auth.users только для shadow-базы ──────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (
      id                 uuid PRIMARY KEY,
      email              varchar(255),
      raw_user_meta_data jsonb
    );
    RAISE NOTICE 'Схемы auth нет — создана заглушка для shadow-базы Prisma';
  END IF;
END $$;

-- ─── 2. Профиль без учётной записи существовать не может ────────────────────

-- Тестовые пользователи Фазы 1 писались напрямую в public."User" и учётных
-- записей в auth.users не имеют. Внешний ключ на них не встанет, поэтому они
-- удаляются (каскадом уходят их заказы, предложения, файлы и уведомления).
-- Данные восстанавливаются `npm run db:seed` — теперь через Supabase Admin API.
DELETE FROM public."User" u
WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id);

ALTER TABLE public."User"
  ADD CONSTRAINT "User_id_fkey"
  FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;

-- ─── 3. companyName обязателен для роли COMPANY (ТЗ §3) ─────────────────────

ALTER TABLE public."User"
  ADD CONSTRAINT "User_companyName_required_for_company"
  CHECK ("role" <> 'COMPANY' OR "companyName" IS NOT NULL);

-- ─── 4. Создание и синхронизация профиля ────────────────────────────────────

-- Одна функция на два триггера: вставка учётной записи создаёт профиль,
-- смена email в auth.users обновляет его в профиле (ТЗ §3).
--
-- SECURITY DEFINER: функция выполняется от владельца (postgres), а он не
-- подчиняется RLS. GoTrue пишет в auth.users от роли supabase_auth_admin,
-- у которой прав на public."User" нет и быть не должно.
--
-- Отсутствие обязательных метаданных — это ошибка: она отменяет вставку
-- в auth.users целиком. Состояние «учётная запись есть, профиля нет»
-- невозможно по построению (ТЗ §3).
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
  phone        text  := nullif(btrim(coalesce(meta->>'phone', '')), '');
  company_name text  := nullif(btrim(coalesce(meta->>'companyName', '')), '');
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

  INSERT INTO public."User" (
    id, email, "role", "firstName", "lastName", phone,
    "companyName", city, country, "createdAt", "updatedAt"
  )
  VALUES (
    NEW.id,
    NEW.email,
    user_role::public."Role",
    first_name,
    nullif(btrim(coalesce(meta->>'lastName', '')), ''),
    phone,
    -- У клиента поле пустое даже если что-то пришло в метаданных.
    CASE WHEN user_role = 'COMPANY' THEN company_name END,
    nullif(btrim(coalesce(meta->>'city', '')), ''),
    nullif(btrim(coalesce(meta->>'country', '')), ''),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
    SET email       = EXCLUDED.email,
        "updatedAt" = now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_upsert();

CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.handle_auth_user_upsert();

-- ─── 5. Custom Access Token Hook: claim user_role (ТЗ §6) ───────────────────

-- Роль кладётся в токен, чтобы RolesGuard читал её из проверенной подписи
-- и не ходил в базу на каждый запрос.
--
-- Функция обязана возвращать event даже когда профиля нет: если вернуть NULL
-- или бросить исключение, GoTrue не выдаст токен вообще, и пользователь
-- не сможет войти.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  user_role text;
BEGIN
  SELECT "role"::text
    INTO user_role
    FROM public."User"
   WHERE id = (event->>'user_id')::uuid;

  IF user_role IS NULL THEN
    RETURN event;
  END IF;

  RETURN jsonb_set(event, '{claims,user_role}', to_jsonb(user_role));
END;
$$;

-- Хук вызывает GoTrue от своей роли. Всем остальным функция не нужна:
-- по умолчанию EXECUTE выдан PUBLIC, поэтому право отзывается явно.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_auth_user_upsert() FROM public, anon, authenticated;
