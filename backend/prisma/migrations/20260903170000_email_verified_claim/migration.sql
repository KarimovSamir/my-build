-- Ревизия Фазы 2 (находка 2-С3): подтверждение email должно проверяться кодом,
-- а не только переключателем в панели Supabase (ТЗ §6: «до подтверждения
-- пользователь не может пользоваться кабинетом»).
--
-- Хук доступа получает второй claim — `email_verified`. Источник значения —
-- auth.users.email_confirmed_at, то есть поле, которое пишет сам GoTrue.
-- Одноимённое поле в user_metadata для этого не годится: метаданные
-- пользователь меняет сам через updateUser, и проверка обходилась бы
-- одним запросом.
--
-- Функция остаётся STABLE SECURITY DEFINER: её вызывает GoTrue от роли
-- supabase_auth_admin, у которой нет прав ни на public."User", ни на auth.users.
-- Права выданы прежней миграцией и на CREATE OR REPLACE не теряются.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  user_id        uuid    := (event->>'user_id')::uuid;
  claims         jsonb   := coalesce(event->'claims', '{}'::jsonb);
  user_role      text;
  email_verified boolean;
BEGIN
  SELECT "role"::text
    INTO user_role
    FROM public."User"
   WHERE id = user_id;

  SELECT u.email_confirmed_at IS NOT NULL
    INTO email_verified
    FROM auth.users u
   WHERE u.id = user_id;

  -- Учётной записи нет — считаем неподтверждённой: отсутствие права
  -- безопаснее его молчаливой выдачи.
  claims := jsonb_set(claims, '{email_verified}', to_jsonb(coalesce(email_verified, false)));

  -- Профиля может не быть (первый вход в момент создания). Тогда роли в токене
  -- нет, и RolesGuard скажет об этом прямо; бросать исключение нельзя —
  -- GoTrue тогда не выдаст токен вообще, и пользователь не сможет войти.
  IF user_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM public, anon, authenticated;
