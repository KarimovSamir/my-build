"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Тема оформления (ТЗ §7: тёмная/светлая).
 *
 * Класс `dark` вешается на `<html>` — под него написан вариант `dark`
 * в `globals.css`. Выбор хранится в localStorage; пока пользователь не выбрал
 * ничего, берётся тема операционной системы. Скрипт провайдера выставляет класс
 * до первой отрисовки, поэтому светлая тема не мигает на тёмной системе.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
