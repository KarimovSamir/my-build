import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Восстановление пароля" };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Восстановление пароля</CardTitle>
        <CardDescription>
          Укажите email, и мы пришлём ссылку для установки нового пароля
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ForgotPasswordForm />

        <p className="text-muted-foreground text-sm">
          Вспомнили пароль?{" "}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Войти
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
