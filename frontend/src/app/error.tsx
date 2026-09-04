"use client";

import { ErrorState } from "@/components/error-state";

/**
 * Отказ на уровне всего приложения — в том числе в каркасе кабинета:
 * `(app)/layout.tsx` на каждый рендер запрашивает профиль, и упавший backend
 * ронял бы любой экран в стандартную страницу ошибки Next.js.
 *
 * Каркаса здесь нет (граница выше него), поэтому карточка центрируется сама.
 */
export default function AppRootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <ErrorState digest={error.digest} retry={retry} />
      </div>
    </main>
  );
}
