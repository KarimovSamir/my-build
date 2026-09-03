import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Логотип MyBuild: картинка плюс название.
 *
 * Размер задаётся не числом, а одним из трёх шагов: картинка и текст обязаны
 * меняться вместе, а `width`/`height` у `next/image` — совпадать с высотой на
 * экране. Иначе браузер предзагружает один вариант картинки, а рисует другой.
 */

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
}

export function Logo({ href = "/", className, size = "md" }: LogoProps) {
  const { px, image, text } = sizes[size];

  const content = (
    <span className={cn("flex items-center gap-2.5", className)}>
      <Image
        src="/mybuild-logo.png"
        alt=""
        width={px}
        height={px}
        className={cn("w-auto object-contain", image)}
        priority
      />
      <span className={cn("font-semibold tracking-tight", text)}>MyBuild</span>
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} className="focus-visible:ring-ring rounded-md focus-visible:ring-2 focus-visible:outline-none">
      {content}
    </Link>
  );
}
