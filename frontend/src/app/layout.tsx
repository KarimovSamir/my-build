import type { Metadata } from "next";
import { IBM_Plex_Mono, Literata, Manrope } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

// Интерфейс на русском, поэтому каждый шрифт обязан содержать кириллицу —
// иначе браузер подставит системный и вёрстка «поедет».
//
// Три семейства на весь продукт, лендинг и кабинет вместе: антиква —
// заголовкам, гротеск — тексту, моноширинный — номерам, суммам и датам.
// Утилиты `font-heading` / `font-sans` / `font-mono` объявлены в `globals.css`.
const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "MyBuild — маркетплейс для строительства",
    template: "%s · MyBuild",
  },
  description:
    "MyBuild соединяет заказчиков строительных работ со строительными компаниями: заказ, предложения с ценой и сроком, контроль работ и приёмка результата.",
  icons: { icon: "/mybuild-logo.png" },
  // Демо закрыто от индексации: данные внутри seed'овые и выдуманные, а живёт
  // оно теперь на поддомене бренда. Вторая половина запрета (robots.txt) - в
  // `src/app/robots.ts`, там же причина целиком. Снимать только вместе с ним.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning нужен теме: класс `dark` на <html> выставляет
    // скрипт next-themes до гидратации, и разметка сервера с ним не совпадает.
    <html
      lang="ru"
      suppressHydrationWarning
      className={`${literata.variable} ${manrope.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          {children}
          <Toaster position="top-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
