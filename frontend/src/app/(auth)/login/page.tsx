import Link from "next/link";

import { FormError } from "@/components/form-parts";
import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeNextPath } from "@/lib/redirects";

export const metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Вход</CardTitle>
        <CardDescription>Войдите, чтобы продолжить работу с заказами</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error === "link" ? (
          <FormError>
            Ссылка из письма не сработала: она уже использована или устарела.
          </FormError>
        ) : null}

        <LoginForm next={safeNextPath(next)} />

        <div className="text-muted-foreground flex flex-col gap-1 text-sm">
          <Link href="/forgot-password" className="text-primary hover:underline">
            Забыли пароль?
          </Link>
          <p>
            Нет аккаунта?{" "}
            <Link href="/register" className="text-primary font-medium hover:underline">
              Зарегистрироваться
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
