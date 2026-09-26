"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Тема оформления (ТЗ §7: тёмная/светлая).
 *
 * Класс `dark` вешается на `<html>` — под него написан вариант `dark`
 * в `globals.css`. Выбор хранится в localStorage; пока пользователь не выбрал
 * ничего, тема светлая, даже на тёмной системе (решение пользователя).
 * «Как в системе» остаётся пунктом переключателя. Скрипт провайдера выставляет
 * класс до первой отрисовки, поэтому сохранённая тёмная тема не мигает светлой.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
