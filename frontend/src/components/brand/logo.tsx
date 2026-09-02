import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

interface LogoProps {
  href?: string;
  className?: string;
  /** Размер картинки в пикселях. Текст масштабируется вместе с ней. */
  size?: number;
}

export function Logo({ href = "/", className, size = 32 }: LogoProps) {
  const content = (
    <span className={cn("flex items-center gap-2.5", className)}>
      <Image
        src="/mybuild-logo.png"
        alt=""
        width={size}
        height={size}
        className="h-8 w-auto object-contain"
        priority
      />
      <span className="text-xl font-semibold tracking-tight">MyBuild</span>
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} className="focus-visible:ring-ring rounded-md focus-visible:ring-2 focus-visible:outline-none">
      {content}
    </Link>
  );
}
