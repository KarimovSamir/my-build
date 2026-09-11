import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Страница не найдена" };

/**
 * Адрес, которого в приложении нет.
 *
 * Ловит всё, что не совпало ни с одним маршрутом: опечатку в ссылке, старую
 * ссылку из переписки, чужую закладку. Без этого файла Next.js показывает свою
 * служебную страницу — по-английски и без темы оформления.
 *
 * Разделы кабинета сюда не приходят: у заказа и подрядчика свои `not-found`,
 * где объясняется именно «заказ не найден», а не «адреса нет».
 *
 * Сессия здесь не читается намеренно, хотя кнопку и хотелось бы подписать
 * «В кабинет». Границу `not-found` Next.js вкладывает в каждый маршрут, и
 * обращение к cookie делает динамическими заодно лендинг, регистрацию и
 * восстановление пароля — то есть три страницы, которые сейчас отдаются
 * готовыми. Вести на `/` не хуже: лендинг сам уводит вошедшего в его кабинет.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-10">
      <Logo size="lg" />

      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
          <div>
            <p className="text-muted-foreground text-5xl font-semibold tracking-tight">
              404
            </p>
            <p className="mt-3 font-medium">Такой страницы нет</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Возможно, адрес набран с ошибкой или страница переехала.
            </p>
          </div>

          <Button variant="outline" asChild>
            <Link href="/">
              <ArrowLeft className="size-4" aria-hidden />
              На главную
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
