import { AuthHeader } from "@/components/auth/auth-header";
import { LoginForm } from "@/components/auth/login-form";
import { FormError } from "@/components/form-parts";
import { safeNextPath } from "@/lib/redirects";

export const metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;

  return (
    <div className="flex flex-col gap-8">
      <AuthHeader title="С возвращением" description="Войдите, чтобы вернуться к своим заказам" />

      {/* Ссылку регистрации, открытую не в том браузере, где заполняли форму,
          Supabase подтверждает, а войти по ней не даёт (PKCE). Пароля у такой
          учётки ещё нет — его стирает подтверждение, — и выход один: задать
          его через «Забыли пароль». */}
      {error === "link" ? (
        <FormError>
          Ссылка из письма не сработала: она уже использована, устарела или открыта не в
          том браузере. Если вы подтверждали регистрацию, задайте пароль через «Забыли
          пароль?».
        </FormError>
      ) : null}

      <LoginForm next={safeNextPath(next)} />
    </div>
  );
}
