-- Сменить пароль можно только сразу после входа.
--
-- Пароль меняется прямо в Supabase Auth (`supabase.auth.updateUser`
-- с публикуемым ключом), мимо нашего backend. GoTrue для этого хватает одной
-- живой сессии, поэтому проверка текущего пароля в `/settings` защищала только
-- интерфейс: угнанная сессия меняла пароль из консоли браузера или через
-- экран `/reset-password` и запирала владельца снаружи. Серверный
-- переключатель Supabase («Secure password change») на бесплатном тарифе
-- недоступен, поэтому проверка живёт в единственной серверной точке этого
-- пути — строке auth.users.
--
-- Признак свежего входа — `last_sign_in_at`. GoTrue пишет его, когда выдаёт
-- новую сессию: вход паролем, переход по ссылке восстановления. Продление
-- токена его не трогает (проверено на живом проекте), то есть сессия, которую
-- просто держат открытой, свежей не становится. Оба законных пути смены
-- укладываются в окно сами:
--
--   /settings        — форма входит текущим паролем прямо перед updateUser;
--   /reset-password  — ссылка из письма только что выдала новую сессию.
--
-- Окно — 15 минут, то же число в frontend/src/lib/password-form.ts
-- (PASSWORD_CHANGE_WINDOW_MINUTES): по нему экран `/reset-password` решает,
-- показывать ли форму. Расходиться они не должны.
--
-- Признак относится к учётке, а не к сессии: если владелец только что вошёл
-- на другом устройстве, у угнанной сессии те же 15 минут. Точнее без
-- серверной поддержки GoTrue не сделать — сессию, от имени которой идёт
-- UPDATE, триггер не видит.
--
-- Перехеширование не блокируется. При входе GoTrue переписывает хеш с
-- нестандартной стоимостью bcrypt (или импортированный хеш другого алгоритма)
-- ещё до выдачи сессии, то есть с устаревшим `last_sign_in_at`, — и запрет
-- тут сломал бы вход. Такую запись отличает смена префикса хеша
-- (`$2a$10$` — алгоритм и стоимость); обычная смена пароля хеширует той же
-- стоимостью, что и прежде, и префикс не меняет.
--
-- Админская смена пароля (Admin API, `updateUserById`) проходит через тот же
-- UPDATE и тоже требует недавнего входа учётки: отличить её от
-- пользовательской триггер не может. В проекте её нет — seed и e2e заводят
-- учётки вставкой, а не обновлением.

CREATE OR REPLACE FUNCTION public.require_recent_sign_in_for_password_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password
     AND left(coalesce(NEW.encrypted_password, ''), 7)
         = left(coalesce(OLD.encrypted_password, ''), 7)
     AND (
       OLD.last_sign_in_at IS NULL
       OR OLD.last_sign_in_at < now() - interval '15 minutes'
     )
  THEN
    RAISE EXCEPTION 'Пароль меняется только сразу после входа: войдите заново и повторите';
  END IF;

  RETURN NEW;
END;
$$;

-- Без списка колонок, как у on_auth_user_demo_lock: в заглушке auth.users
-- для shadow-базы (миграция auth_profiles) колонки encrypted_password нет,
-- и `UPDATE OF encrypted_password` там не создался бы.
CREATE TRIGGER on_auth_user_password_reauth
  BEFORE UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.require_recent_sign_in_for_password_change();

REVOKE EXECUTE ON FUNCTION public.require_recent_sign_in_for_password_change() FROM public, anon, authenticated;
