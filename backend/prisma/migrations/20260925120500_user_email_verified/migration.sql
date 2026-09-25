-- Каталог подрядчиков показывает только компании с подтверждённым email.
--
-- Профиль создаётся триггером сразу при `signUp`, до подтверждения адреса,
-- а каталог отбирал компании только по роли и названию. «Компанию» можно было
-- зарегистрировать на чужой адрес и сразу показать клиентам её название
-- и контакты — ничего не подтверждая. Кабинет такой учётке закрыт
-- (claim `email_verified`), но каталог читает чужие профили, а не её токен.
--
-- Источник правды — auth.users.email_confirmed_at: его пишет сам GoTrue,
-- пользователь не меняет. Запросам Prisma схема auth недоступна, поэтому
-- время подтверждения копируется в профиль триггером — так же, как email.

ALTER TABLE public."User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- ─── Заглушка для shadow-базы ───────────────────────────────────────────────
-- В заглушке auth.users (миграция auth_profiles) этой колонки нет, а триггер
-- с `UPDATE OF email_confirmed_at` без неё не создаётся. На настоящей базе
-- колонка есть всегда, и блок ничего не делает.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_confirmed_at'
  ) THEN
    ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz;
  END IF;
END $$;

UPDATE public."User" u
   SET "emailVerifiedAt" = a.email_confirmed_at
  FROM auth.users a
 WHERE a.id = u.id
   AND a.email_confirmed_at IS NOT NULL;

-- SECURITY DEFINER по той же причине, что у handle_auth_user_upsert: GoTrue
-- пишет в auth.users от роли supabase_auth_admin, прав на public."User"
-- у неё нет.
CREATE OR REPLACE FUNCTION public.sync_user_email_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- `UPDATE OF` срабатывает, когда колонка просто стоит в SET, даже с прежним
  -- значением. Писать в профиль тогда нечего.
  IF TG_OP = 'UPDATE' AND NEW.email_confirmed_at IS NOT DISTINCT FROM OLD.email_confirmed_at THEN
    RETURN NEW;
  END IF;

  UPDATE public."User"
     SET "emailVerifiedAt" = NEW.email_confirmed_at
   WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

-- Учётка, созданная уже подтверждённой (Admin API с `email_confirm`, seed,
-- e2e), подтверждена в момент вставки. Профиль к этому времени должен
-- существовать: триггеры одного события Postgres запускает в алфавитном
-- порядке имён, и on_auth_user_created идёт раньше on_auth_user_email_confirmed.
-- Переименовывая любой из двух, сохранять этот порядок.
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_email_verified();

REVOKE EXECUTE ON FUNCTION public.sync_user_email_verified() FROM public, anon, authenticated;
