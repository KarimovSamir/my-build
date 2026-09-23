import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Логотип MyBuild: картинка плюс название.
 *
 * Размер задаётся не числом, а одним из трёх шагов: картинка и текст обязаны
 * меняться вместе, а высота в пропсах `next/image` — совпадать с высотой на
 * экране. Иначе браузер предзагружает один вариант картинки, а рисует другой.
 *
 * Ширина считается из пропорций самого файла, а не берётся равной высоте:
 * логотип не квадратный, и от квадрата в пропсах `next/image` в dev-режиме
 * писал в консоль предупреждение «width or height modified, but not the other»
 * — отрисованная ширина не совпадала с объявленной.
 */

/** Пропорции `public/mybuild-logo.png` — 1125 × 773. */
const LOGO_RATIO = 1125 / 773;

const sizes = {
  sm: { px: 24, image: "h-6", text: "text-base" },
  md: { px: 32, image: "h-8", text: "text-xl" },
  lg: { px: 40, image: "h-10", text: "text-2xl" },
} as const;

export type LogoSize = keyof typeof sizes;

interface LogoProps {
  href?: string;
  className?: string;
  size?: LogoSize;
  /**
   * Вариант для тёмных полос (боковое меню, подвал лендинга): вместо картинки
   * рисуется контурный знак. Файл логотипа наполовину чёрный и на `--brand-ink`
   * превращается в пятно, поэтому там знак собирается линиями по цвету полосы.
   */
  tone?: "default" | "ink";
}

export function Logo({ href = "/", className, size = "md", tone = "default" }: LogoProps) {
  const { px, image, text } = sizes[size];

  const content = (
    <span
      className={cn(
        "flex items-center gap-2.5",
        tone === "ink" && "text-brand-ink-foreground",
        className,
      )}
    >
      {tone === "ink" ? (
        <InkMark className={cn("w-auto", image)} />
      ) : (
        <Image
          src="/mybuild-logo.png"
          alt=""
          width={Math.round(px * LOGO_RATIO)}
          height={px}
          className={cn("w-auto object-contain", image)}
          priority
        />
      )}
      <span className={cn("font-heading font-semibold tracking-tight", text)}>MyBuild</span>
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} className="focus-visible:ring-ring rounded-md focus-visible:ring-2 focus-visible:outline-none">
      {content}
    </Link>
  );
}

/** Кровля и кладка — тот же знак, что на картинке логотипа, но линиями. */
function InkMark({ className }: { className?: string }) {
  const bricks = [
    { x: 9, y: 11.5 },
    { x: 15, y: 11.5 },
    { x: 6, y: 16.6 },
    { x: 12, y: 16.6 },
    { x: 18, y: 16.6 },
  ];

  return (
    <svg viewBox="0 0 30 26" fill="none" className={className} aria-hidden>
      <path
        d="M2 24 L14 2 L26 24"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {bricks.map(({ x, y }) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="5"
          height="3.4"
          rx="0.9"
          className="fill-brand-ink-accent"
        />
      ))}
    </svg>
  );
}
