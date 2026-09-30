-- Пароль, заданный при регистрации, не переживает подтверждение адреса.
--
-- Захват учётки заранее (pre-account takeover). Злоумышленник регистрирует
-- чужой адрес со своим паролем и не подтверждает его. Когда настоящий
-- владелец регистрируется сам, GoTrue существующую неподтверждённую учётку
-- не трогает («do not update the user because we can't be sure of their
-- claimed identity», internal/api/signup.go) — только шлёт письмо ещё раз.
-- Владелец жмёт ссылку и подтверждает учётку, в которой пароль чужой: дальше
-- злоумышленник входит им когда захочет и видит заказы, адреса и файлы.
--
-- Кто задал пароль до подтверждения, неизвестно: адрес ещё никто не доказал.
-- Поэтому в момент подтверждения пароль стирается, а задаёт его тот, кто
-- открыл ссылку из письма, — сессией, которую эта ссылка и выдала
-- (/callback → /reset-password). Регистрация пароль больше не спрашивает.
--
-- Пустой `encrypted_password` GoTrue понимает как «пароля нет»: вход паролем
-- отказывает (models/user.go, Authenticate), а `updateUser({ password })`
-- задаёт его заново. Триггер `on_auth_user_password_reauth` этому не мешает
-- ни здесь, ни при установке нового: он сравнивает префикс хеша, а у пустой
-- строки его нет.
--
-- Только UPDATE, и только первое подтверждение (NULL → значение). Учётки,
-- созданные сразу подтверждёнными (seed, e2e, Admin API с `email_confirm`),
-- вставляются — их пароль не трогается. Смена email подтверждения заново
-- не обнуляет, то есть и сюда не попадает.
--
-- BEFORE-триггеры одного события Postgres запускает по алфавиту имён:
-- этот идёт после `on_auth_user_demo_lock` и `on_auth_user_password_reauth`,
-- и они видят строку ещё без стёртого пароля. Демо-учётки подтверждены
-- с создания, так что запрет менять им пароль здесь не срабатывает.

CREATE OR REPLACE FUNCTION public.reset_password_on_signup_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    NEW.encrypted_password := '';
  END IF;

  RETURN NEW;
END;
$$;

-- Без списка колонок, как у соседних триггеров: в заглушке auth.users
-- для shadow-базы колонки encrypted_password нет.
CREATE TRIGGER on_auth_user_signup_confirmed
  BEFORE UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_password_on_signup_confirmation();

REVOKE EXECUTE ON FUNCTION public.reset_password_on_signup_confirmation() FROM public, anon, authenticated;
