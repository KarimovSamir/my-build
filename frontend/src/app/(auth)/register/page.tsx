import Link from "next/link";

import { RegisterForm } from "@/components/auth/register-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Регистрация" };

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Регистрация</CardTitle>
        <CardDescription>
          Выберите роль: клиент размещает заказы, компания на них отвечает
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <RegisterForm />

        <p className="text-muted-foreground text-sm">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Войти
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
