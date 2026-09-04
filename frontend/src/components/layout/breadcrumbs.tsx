"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import { buildBreadcrumbs } from "@/lib/breadcrumbs";
import { Role } from "@/lib/types";

/**
 * Хлебные крошки в шапке (ТЗ §7).
 *
 * Что именно показывать, решает `lib/breadcrumbs.ts` — здесь только разметка.
 */
export function Breadcrumbs({ role }: { role: Role | null }) {
  const pathname = usePathname();
  const crumbs = buildBreadcrumbs(pathname, role);

  return (
    <nav aria-label="Хлебные крошки" className="flex items-center gap-2 text-sm">
      {crumbs.map((crumb, index) => (
        <Fragment key={`${crumb.label}-${index}`}>
          {index > 0 ? (
            <span className="text-muted-foreground/50" aria-hidden>
              /
            </span>
          ) : null}

          {crumb.href === null ? (
            <span className={crumb.current ? "font-medium" : "text-muted-foreground"}>
              {crumb.label}
            </span>
          ) : (
            <Link
              href={crumb.href}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {crumb.label}
            </Link>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
