import { NextResponse, type NextRequest } from "next/server";

import { Role } from "@/lib/types";

import { getHomeHref, SESSION_ISSUE_PAGES } from "./lib/navigation";
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

/** Служебные экраны про испорченную сессию: без входа они бессмысленны. */
const SESSION_ISSUE_PATHS: string[] = Object.values(SESSION_ISSUE_PAGES);

/**
 * Экраны, где сессия как раз устанавливается или меняется.
 *
 * Уводить с них нельзя ни при каких проблемах с сессией: ссылка из письма
 * подтверждения приводит именно на `/callback`, и увод оттуда означал бы,
 * что подтвердить email нельзя никогда.
 */
const AUTH_FLOW_PAGES = ["/callback", "/reset-password"];

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { response, userId, role, emailVerified } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (!userId) {
    if (isAppSection(pathname)) {
      // Куда шли — запомним, чтобы после входа вернуть туда же.
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname + request.nextUrl.search);
      return NextResponse.redirect(login);
    }

    if (SESSION_ISSUE_PATHS.includes(pathname)) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    return response;
  }

  if (isAuthFlowPage(pathname)) {
    return response;
  }

  // Вошёл, но кабинетом пользоваться нельзя: причина показывается отдельным
  // экраном, иначе пользователь упрётся в 401/403 от API без объяснений.
  const stayOrGo = (target: string) =>
    pathname === target ? response : NextResponse.redirect(new URL(target, request.url));

  if (!emailVerified) {
    return stayOrGo(SESSION_ISSUE_PAGES.unverifiedEmail);
  }

  if (!role) {
    return stayOrGo(SESSION_ISSUE_PAGES.missingRole);
  }

  if (GUEST_ONLY_PAGES.includes(pathname) || SESSION_ISSUE_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL(getHomeHref(role), request.url));
  }

  if (!isAllowedForRole(pathname, role)) {
    return NextResponse.redirect(new URL(getHomeHref(role), request.url));
  }

  return response;
}

function isAuthFlowPage(pathname: string): boolean {
  return AUTH_FLOW_PAGES.some(
    (page) => pathname === page || pathname.startsWith(`${page}/`),
  );
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
