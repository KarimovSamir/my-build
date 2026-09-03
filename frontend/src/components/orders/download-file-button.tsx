"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { DownloadLink } from "@mybuild/shared";

import { Button } from "@/components/ui/button";
import { ApiRequestError } from "@/lib/api";
import { browserApi } from "@/lib/api.client";

/**
 * Скачивание файла заказа (ТЗ §5, §6).
 *
 * Ссылка запрашивается в момент нажатия, а не кладётся в разметку: подпись
 * живёт пять минут и выдаётся под конкретного пользователя, поэтому в HTML
 * страницы ей делать нечего — к моменту клика она успела бы протухнуть.
 *
 * Переход по ссылке страницу не меняет: Supabase отдаёт объект с
 * `Content-Disposition: attachment`, и браузер просто сохраняет файл.
 */
export function DownloadFileButton({
  fileId,
  fileName,
}: {
  fileId: string;
  fileName: string;
}) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);

    try {
      const link = await browserApi.get<DownloadLink>(`/documents/${fileId}/download`);
      window.location.href = link.url;
    } catch (error) {
      toast.error("Не удалось скачать файл", { description: describe(error) });
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={handleClick}
      aria-label={`Скачать файл ${fileName}`}
    >
      <Download className="size-4" aria-hidden />
      {pending ? "Готовим…" : "Скачать"}
    </Button>
  );
}

function describe(error: unknown): string {
  if (!(error instanceof ApiRequestError)) {
    return "Проверьте соединение и попробуйте ещё раз";
  }

  if (error.statusCode === 401) return "Сессия истекла. Войдите заново";
  if (error.statusCode === 404) return "Файл больше не доступен";

  return error.message;
}
