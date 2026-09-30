-- Пароль стирается только при подтверждении по письму, а не при любом.
--
-- Триггер `on_auth_user_signup_confirmed` (миграция
-- 20260930120000_signup_confirm_resets_password) стирал пароль на любом первом
-- подтверждении. Но Admin API (`createUser` с `email_confirm: true`) создаёт
-- учётку не одним INSERT, а вставкой и отдельным UPDATE подтверждения —
-- и такие учётки (e2e, пересоздание демо-учёток seed'ом) оставались без
-- пароля: вход отвечал «Invalid login credentials». Проверено на живой базе.
--
-- Отличает их `confirmation_sent_at`: подтвердить адрес по ссылке можно,
-- только если письмо с ней отправляли, а Admin API с `email_confirm`
-- письма не шлёт и поле оставляет пустым. Захват адреса заранее этим
-- не открывается: злоумышленник регистрируется через `signUp`, тот шлёт
-- письмо, и подтверждение такой учётки пароль по-прежнему стирает.

CREATE OR REPLACE FUNCTION public.reset_password_on_signup_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.email_confirmed_at IS NULL
     AND NEW.email_confirmed_at IS NOT NULL
     AND OLD.confirmation_sent_at IS NOT NULL
  THEN
    NEW.encrypted_password := '';
  END IF;

  RETURN NEW;
END;
$$;
