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

      {error === "link" ? (
        <FormError>Ссылка из письма не сработала: она уже использована или устарела.</FormError>
      ) : null}

      <LoginForm next={safeNextPath(next)} />
    </div>
  );
}
