"use client";

import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Экран «что-то пошло не так» с кнопкой повтора (ТЗ §7).
 *
 * Один компонент на все границы ошибок приложения: они различаются только
 * тем, что вокруг них — каркас кабинета, пустая страница или собственный
 * документ (`global-error`).
 *
 * Что показывать пользователю: причина отказа в продакшене до браузера
 * не доезжает (Next.js заменяет сообщение серверной ошибки на общий текст
 * с идентификатором), поэтому объясняем не «что сломалось», а «что делать».
 * Идентификатор показываем: по нему ошибку находят в логах сервера.
 */
export function ErrorState({
  digest,
  retry,
}: {
  digest?: string;
  retry: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
        <div>
          <p className="font-medium">Не удалось загрузить страницу</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Возможно, пропала связь с сервером. Попробуйте ещё раз — если
            не поможет, вернитесь через пару минут.
          </p>
        </div>

        <Button variant="outline" onClick={retry}>
          <RefreshCw className="size-4" aria-hidden />
          Повторить
        </Button>

        {digest ? (
          <p className="text-muted-foreground text-xs">Код ошибки: {digest}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
