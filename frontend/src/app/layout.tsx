import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

// Интерфейс на русском, поэтому шрифт обязан содержать кириллицу —
// иначе браузер подставит системный и вёрстка «поедет».
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning нужен теме: класс `dark` на <html> выставляет
    // скрипт next-themes до гидратации, и разметка сервера с ним не совпадает.
    <html
      lang="ru"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
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
