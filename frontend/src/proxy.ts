import { NextResponse, type NextRequest } from "next/server";

import { Role } from "@mybuild/shared";

import { getHomeHref } from "./lib/navigation";
import { updateSession } from "./lib/supabase/proxy";

/**
 * Обновление сессии и защита маршрутов (ТЗ §7, §10).
 *
 * В Next.js 16 это бывший middleware.ts. Задачи ровно две: продлить сессию
 * Supabase и не пустить пользователя на чужой экран.
 *
 * Это не единственная защита, а первая: настоящие проверки прав живут
 * на backend'е, который заново проверяет токен на каждый запрос. Здесь —
 * только чтобы человек не смотрел на пустую страницу с ошибкой.
 */

/** Разделы кабинета: без сессии сюда нельзя. */
const APP_SECTIONS = [
  "/orders",
  "/contractors",
  "/available",
  "/offers",
  "/documents",
  "/notifications",
  "/settings",
];

/** Экраны входа: вошедшему пользователю показывать их незачем. */
const GUEST_ONLY_PAGES = ["/login", "/register", "/forgot-password"];

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { response, userId, role } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (!userId) {
    if (isAppSection(pathname)) {
      // Куда шли — запомним, чтобы после входа вернуть туда же.
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname + request.nextUrl.search);
      return NextResponse.redirect(login);
    }

    return response;
  }

  if (GUEST_ONLY_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL(getHomeHref(role), request.url));
  }

  if (role && !isAllowedForRole(pathname, role)) {
    return NextResponse.redirect(new URL(getHomeHref(role), request.url));
  }

  return response;
}

function isAppSection(pathname: string): boolean {
  return APP_SECTIONS.some(
    (section) => pathname === section || pathname.startsWith(`${section}/`),
  );
}

/**
 * Разделы ролей не пересекаются, кроме страницы заказа: `/orders/[id]`
 * открывают обе стороны — и клиент, и компания с предложением (ТЗ §7).
 */
function isAllowedForRole(pathname: string, role: Role): boolean {
  if (pathname === "/orders" || pathname === "/orders/new") {
    return role === Role.CLIENT;
  }

  if (pathname.startsWith("/orders/")) {
    return true;
  }

  if (pathname === "/contractors" || pathname.startsWith("/contractors/")) {
    return role === Role.CLIENT;
  }

  if (pathname === "/available" || pathname === "/offers") {
    return role === Role.COMPANY;
  }

  return true;
}

export const config = {
  matcher: [
    /*
     * Все страницы, кроме статики и файлов метаданных: сессию надо продлевать
     * даже на публичных, иначе токен протухнет у того, кто просто читал лендинг.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
