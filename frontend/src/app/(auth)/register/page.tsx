import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Регистрация" };

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Регистрация</CardTitle>
        <CardDescription>
          Выбор роли и форма регистрации появятся в Фазе 2 вместе с Supabase Auth.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="text-primary font-medium hover:underline">
          Войти
        </Link>
      </CardContent>
    </Card>
  );
}
