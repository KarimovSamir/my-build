"use client";

import {
  Ban,
  Check,
  CheckCircle2,
  FileUp,
  Inbox,
  PackageCheck,
  Ruler,
  RotateCcw,
  Trash2,
  Undo2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { NotificationType, type NotificationDto } from "@/lib/types";

import { useUnread } from "@/components/notifications/unread-provider";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api-errors";
import { browserApi } from "@/lib/api.client";
import { formatDate } from "@/lib/format";
import { notificationHref } from "@/lib/notification-view";
import { cn } from "@/lib/utils";

/**
 * Одно уведомление в списке (ТЗ §7).
 *
 * Заголовок ведёт к заказу — это и есть «клик → переход к заказу», — и заодно
 * помечает уведомление прочитанным: открыл, значит прочитал. Отдельная кнопка
 * нужна для тех, у кого заказа нет (`ORDER_DELETED`) и для тех, кто не хочет
 * никуда уходить.
 *
 * Запись `Record` по всем типам, а не `switch` с `default`: новый
 * `NotificationType` не соберётся, пока ему не выберут значок.
 */
const notificationIcons: Record<NotificationType, LucideIcon> = {
  [NotificationType.OFFER_RECEIVED]: Inbox,
  [NotificationType.OFFER_ACCEPTED]: CheckCircle2,
  [NotificationType.OFFER_REJECTED]: XCircle,
  [NotificationType.OFFER_NOT_ACCEPTED]: Ban,
  [NotificationType.OFFER_WITHDRAWN]: Undo2,
  [NotificationType.WORK_SUBMITTED]: PackageCheck,
  [NotificationType.WORK_CONFIRMED]: CheckCircle2,
  [NotificationType.WORK_DISPUTED]: RotateCcw,
  [NotificationType.FILES_UPDATED]: FileUp,
  [NotificationType.AREA_VERIFIED]: Ruler,
  [NotificationType.ORDER_DELETED]: Trash2,
};

export function NotificationRow({ notification }: { notification: NotificationDto }) {
  const router = useRouter();
  const unread = useUnread();
  const [pending, setPending] = useState(false);

  const href = notificationHref(notification);
  const Icon = notificationIcons[notification.type];
  const isRead = notification.isRead;

  /**
   * `reloadList` — остаёмся ли мы на этой странице. При переходе к заказу
   * перечитывать список незачем: мы с него уходим, а счётчик в шапке живёт
   * в каркасе и переживает переход.
   */
  async function markRead(reloadList: boolean) {
    if (isRead || pending) return;

    setPending(true);

    try {
      await browserApi.post(`/notifications/${notification.id}/read`);
    } catch (error) {
      toast.error("Не удалось отметить прочитанным", {
        description: apiErrorMessage(error, "Проверьте соединение и попробуйте ещё раз"),
      });
    } finally {
      setPending(false);
      unread.refresh();

      if (reloadList) router.refresh();
    }
  }

  return (
    <li
      className={cn(
        "flex gap-3 px-4 py-4",
        // Непрочитанное выделено фоном, а не только жирным заголовком: строку
        // видно боковым зрением, не вчитываясь.
        !isRead && "bg-muted/50",
      )}
    >
      <Icon className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          {href ? (
            <Link
              href={href}
              onClick={() => void markRead(false)}
              className={cn(
                "focus-visible:ring-ring/50 hover:underline focus-visible:ring-3 focus-visible:outline-none",
                !isRead && "font-medium",
              )}
            >
              {notification.title}
            </Link>
          ) : (
            // Заказа больше нет — вести некуда, но сама запись остаётся
            // в истории (ТЗ §8).
            <span className={cn(!isRead && "font-medium")}>{notification.title}</span>
          )}

          {!isRead ? (
            <span
              aria-hidden
              className="bg-primary mt-2 size-2 shrink-0 rounded-full"
            />
          ) : null}
        </div>

        {notification.body ? (
          <p className="text-muted-foreground mt-1 text-sm">{notification.body}</p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-muted-foreground text-xs">
            {formatDate(notification.createdAt)}
          </p>

          {!isRead ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => void markRead(true)}
            >
              <Check className="size-4" aria-hidden />
              {pending ? "Отмечаем…" : "Прочитано"}
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
