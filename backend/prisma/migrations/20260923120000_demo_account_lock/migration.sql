-- Общие демо-учётки нельзя увести у остальных посетителей.
--
-- Пароль демо-аккаунтов показан на экране входа. Меняется он не через наш
-- backend, а прямо в Supabase Auth (`supabase.auth.updateUser` с публикуемым
-- ключом), поэтому запрет в интерфейсе или в API ничего не закрывает: любой
-- посетитель сменил бы пароль из консоли браузера, и демо перестало бы
-- открываться у всех до следующего seed. То же с email: смена адреса
-- уводит учётку целиком.
--
-- Единственная серверная точка на этом пути — сама строка auth.users.
-- Демо-учётку отличает `raw_app_meta_data.demo = true`: его ставит seed
-- ключом сервера, а пользователь `app_metadata` не меняет (в отличие от
-- `user_metadata`). Поэтому триггер не знает ни адресов, ни пароля.
--
-- Запрещено ровно то, что уводит учётку: пароль, email и начатая смена email
-- (`email_change` — адрес, который ждёт подтверждения). Вход, обновление
-- токена, метаданные — всё остальное проходит как обычно.
--
-- seed этот запрет не задевает: учётку без флага он пересоздаёт,
-- а у учётки с флагом пароль и так прежний — менять его некому.

CREATE OR REPLACE FUNCTION public.prevent_demo_account_takeover()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(OLD.raw_app_meta_data->>'demo', '') = 'true'
     AND (
       NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password
       OR NEW.email IS DISTINCT FROM OLD.email
       OR coalesce(NEW.email_change, '') IS DISTINCT FROM coalesce(OLD.email_change, '')
     )
  THEN
    RAISE EXCEPTION 'Пароль и email демо-аккаунта не меняются: им пользуются все посетители';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_demo_lock
  BEFORE UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_demo_account_takeover();

REVOKE EXECUTE ON FUNCTION public.prevent_demo_account_takeover() FROM public, anon, authenticated;
