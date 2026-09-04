"use client";

import { ErrorState } from "@/components/error-state";

/**
 * Отказ внутри кабинета: упал запрос страницы к API, не поднялся backend,
 * оборвалась сеть.
 *
 * Граница живёт внутри каркаса, поэтому меню, шапка и крошки остаются
 * на экране, и пользователь может уйти в другой раздел, не перезагружая
 * приложение. Отказ самого каркаса (`(app)/layout.tsx` тянет профиль)
 * этой границей не ловится — он уходит выше, в `app/error.tsx`.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ErrorState digest={error.digest} retry={retry} />;
}
