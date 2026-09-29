-- Выход «везде» у общей демо-учётки выкидывал бы всех посетителей.
--
-- `supabase.auth.signOut({ scope: 'global' })` удаляет все сессии учётки
-- разом, а вместе с ними — refresh-токены. Демо-учёткой одновременно
-- пользуются все посетители: через час, когда истечёт access-токен, каждого
-- выкинуло бы на вход. Интерфейс демо выходит только из своей сессии
-- (`signOutScope` во фронте), но запрос идёт прямо в Supabase Auth, мимо
-- backend, и из консоли браузера его отправит кто угодно. Серверная точка
-- на этом пути одна — таблица auth.sessions.
--
-- GoTrue удаляет сессии так:
--   выход из своей сессии  — DELETE ... WHERE id = $1          (одна строка);
--   выход «везде»          — DELETE ... WHERE user_id = $1     (все строки);
--   выход «остальных»      — DELETE ... WHERE id <> $1 AND user_id = $2.
-- Строчный триггер их не различит, поэтому триггер на весь запрос: отказ,
-- если один запрос удаляет больше одной живой сессии демо-учётки.
--
-- Что проходит как раньше:
-- - выход из своей сессии — одна строка;
-- - уборка GoTrue — она удаляет только истёкшие сессии (`not_after` в прошлом);
-- - удаление учётки (Admin API, пересоздание демо): сессии уходят каскадом
--   уже после строки auth.users, и демо-флаг читать не у кого.
-- Остаётся щель: при ровно двух живых сессиях «выход остальных» удаляет одну
-- строку, и отличить её от своего выхода триггеру нечем. Один выбывший
-- посетитель вместо всех — это уже не поломка демо.
-- Флаг — тот же `raw_app_meta_data.demo`, что у `on_auth_user_demo_lock`.

CREATE OR REPLACE FUNCTION public.prevent_demo_mass_logout()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM removed_sessions AS s
    JOIN auth.users AS u ON u.id = s.user_id
    WHERE coalesce(u.raw_app_meta_data->>'demo', '') = 'true'
      AND (s.not_after IS NULL OR s.not_after > now())
    GROUP BY s.user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Демо-аккаунт выходит только на своём устройстве: им пользуются все посетители';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_demo_mass_logout() FROM public, anon, authenticated;

-- Теневая база Prisma схемы auth не знает (заглушка из миграции профилей
-- заводит только auth.users): там триггер не создаётся.
DO $$
BEGIN
  IF to_regclass('auth.sessions') IS NOT NULL THEN
    CREATE TRIGGER on_auth_session_demo_mass_logout
      AFTER DELETE ON auth.sessions
      REFERENCING OLD TABLE AS removed_sessions
      FOR EACH STATEMENT
      EXECUTE FUNCTION public.prevent_demo_mass_logout();
  END IF;
END;
$$;
