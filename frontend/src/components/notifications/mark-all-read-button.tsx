"use client";

import { CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import type { MarkedRead } from "@/lib/types";

import { useUnread } from "@/components/notifications/unread-provider";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api-errors";
import { browserApi } from "@/lib/api.client";

/**
 * «Прочитать все» (ТЗ §7).
 *
 * Кнопка недоступна, когда непрочитанных нет: счётчик в шапке и она смотрят
 * на одно и то же число, и предлагать действие, которое заведомо ничего
 * не сделает, незачем. Ответ маршрута — сколько строк это действительно
 * задело, поэтому тост говорит правду и в случае гонки: пока диалог висел,
 * уведомления могли прочитать в соседней вкладке.
 */
export function MarkAllReadButton() {
  const router = useRouter();
  const unread = useUnread();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);

    try {
      const { marked } = await browserApi.post<MarkedRead>("/notifications/read-all");

      toast.success(
        marked > 0
          ? `Прочитано уведомлений: ${marked}`
          : "Непрочитанных уведомлений не было",
      );
    } catch (error) {
      toast.error("Не удалось отметить прочитанными", {
        description: apiErrorMessage(error, "Проверьте соединение и попробуйте ещё раз"),
      });
    } finally {
      setPending(false);
      unread.refresh();
      router.refresh();
    }
  }

  return (
    <Button
      variant="outline"
      disabled={pending || unread.count === 0}
      onClick={handleClick}
    >
      <CheckCheck className="size-4" aria-hidden />
      {pending ? "Отмечаем…" : "Прочитать все"}
    </Button>
  );
}
