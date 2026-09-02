import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Вход" };

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Вход</CardTitle>
        <CardDescription>Форма входа появится в Фазе 2 вместе с Supabase Auth.</CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        Нет аккаунта?{" "}
        <Link href="/register" className="text-primary font-medium hover:underline">
          Зарегистрироваться
        </Link>
      </CardContent>
    </Card>
  );
}
