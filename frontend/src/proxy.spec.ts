import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getNavigation } from "@/lib/navigation";
import { Role } from "@/lib/types";

import { proxy } from "./proxy";
import { updateSession } from "./lib/supabase/proxy";

// Продление сессии ходит в Supabase — здесь проверяется только защита
// маршрутов, поэтому результат сессии задаётся тестом.
vi.mock("./lib/supabase/proxy", () => ({ updateSession: vi.fn() }));

interface Session {
  userId?: string | null;
  role?: Role | null;
  emailVerified?: boolean;
}

const ORDER_ID = "6f1c7a0e-0000-4000-8000-000000000001";

/** Гость: сессии нет вовсе. */
const guest: Session = { userId: null, role: null, emailVerified: true };

function signedIn(role: Role, patch: Session = {}): Session {
  return { userId: "user-1", role, emailVerified: true, ...patch };
}

async function go(path: string, session: Session) {
  vi.mocked(updateSession).mockResolvedValue({
    response: NextResponse.next(),
    userId: session.userId ?? null,
    role: session.role ?? null,
    emailVerified: session.emailVerified ?? true,
  });

  const response = await proxy(new NextRequest(`http://localhost:3000${path}`));
  const location = response.headers.get("location");

  return {
    /** Куда увели. `null` — запрос прошёл дальше. */
    redirectedTo: location ? new URL(location).pathname + new URL(location).search : null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("без сессии", () => {
  it("уводит с раздела кабинета на вход и запоминает, куда шли", async () => {
    const { redirectedTo } = await go("/orders?status=WAITING&page=2", guest);

    expect(redirectedTo).toBe("/login?next=%2Forders%3Fstatus%3DWAITING%26page%3D2");
  });

  it("уводит и со страницы заказа", async () => {
    expect((await go(`/orders/${ORDER_ID}`, guest)).redirectedTo).toBe(
      `/login?next=%2Forders%2F${ORDER_ID}`,
    );
  });

  it("пропускает лендинг и экраны входа", async () => {
    expect((await go("/", guest)).redirectedTo).toBeNull();
    expect((await go("/login", guest)).redirectedTo).toBeNull();
    expect((await go("/register", guest)).redirectedTo).toBeNull();
  });

  it("уводит со служебных экранов: без входа они бессмысленны", async () => {
    expect((await go("/verify-email", guest)).redirectedTo).toBe("/login");
    expect((await go("/no-role", guest)).redirectedTo).toBe("/login");
  });
});

describe("email не подтверждён", () => {
  const unverified = signedIn(Role.CLIENT, { emailVerified: false });

  it("уводит из кабинета на экран подтверждения", async () => {
    expect((await go("/orders", unverified)).redirectedTo).toBe("/verify-email");
    expect((await go("/settings", unverified)).redirectedTo).toBe("/verify-email");
  });

  it("на самом экране подтверждения не зацикливается", async () => {
    expect((await go("/verify-email", unverified)).redirectedTo).toBeNull();
  });

  it("не мешает подтвердить адрес по ссылке из письма", async () => {
    // Увод с `/callback` означал бы, что подтвердить email нельзя никогда.
    expect((await go("/callback", unverified)).redirectedTo).toBeNull();
    expect((await go("/callback/complete", unverified)).redirectedTo).toBeNull();
    expect((await go("/reset-password", unverified)).redirectedTo).toBeNull();
  });
});

describe("роли в токене нет", () => {
  const roleless = signedIn(Role.CLIENT, { role: null });

  it("уводит из любого раздела на экран с причиной", async () => {
    expect((await go("/orders", roleless)).redirectedTo).toBe("/no-role");
    expect((await go("/available", roleless)).redirectedTo).toBe("/no-role");
    expect((await go("/", roleless)).redirectedTo).toBe("/no-role");
  });

  it("на самом экране не зацикливается", async () => {
    expect((await go("/no-role", roleless)).redirectedTo).toBeNull();
  });

  it("не мешает установить сессию заново", async () => {
    expect((await go("/callback", roleless)).redirectedTo).toBeNull();
    expect((await go("/reset-password", roleless)).redirectedTo).toBeNull();
  });
});

describe("вошедший пользователь", () => {
  it("не видит экранов входа — его сразу ведут в кабинет", async () => {
    expect((await go("/login", signedIn(Role.CLIENT))).redirectedTo).toBe("/orders");
    expect((await go("/register", signedIn(Role.COMPANY))).redirectedTo).toBe("/available");
    expect((await go("/forgot-password", signedIn(Role.CLIENT))).redirectedTo).toBe("/orders");
  });

  it("не видит служебных экранов, когда с сессией всё в порядке", async () => {
    expect((await go("/verify-email", signedIn(Role.CLIENT))).redirectedTo).toBe("/orders");
    expect((await go("/no-role", signedIn(Role.COMPANY))).redirectedTo).toBe("/available");
  });
});

describe("разделы ролей", () => {
  it("клиента не пускает в кабинет компании", async () => {
    expect((await go("/available", signedIn(Role.CLIENT))).redirectedTo).toBe("/orders");
    expect((await go("/offers", signedIn(Role.CLIENT))).redirectedTo).toBe("/orders");
  });

  it("компанию не пускает в разделы клиента", async () => {
    expect((await go("/orders", signedIn(Role.COMPANY))).redirectedTo).toBe("/available");
    expect((await go("/orders/new", signedIn(Role.COMPANY))).redirectedTo).toBe("/available");
    expect((await go("/contractors", signedIn(Role.COMPANY))).redirectedTo).toBe("/available");
  });

  it("страницу заказа открывают обе роли", async () => {
    // Компания попадает сюда по своему предложению (ТЗ §7).
    expect((await go(`/orders/${ORDER_ID}`, signedIn(Role.CLIENT))).redirectedTo).toBeNull();
    expect((await go(`/orders/${ORDER_ID}`, signedIn(Role.COMPANY))).redirectedTo).toBeNull();
  });

  it("общие разделы открывают обе роли", async () => {
    for (const role of [Role.CLIENT, Role.COMPANY]) {
      for (const path of ["/documents", "/notifications", "/settings"]) {
        expect((await go(path, signedIn(role))).redirectedTo).toBeNull();
      }
    }
  });

  it("каждый пункт меню роли открывается этой ролью", async () => {
    // Сверка меню и защиты маршрутов: пункт, с которого уводит proxy, —
    // ссылка, которая никуда не ведёт.
    for (const role of [Role.CLIENT, Role.COMPANY]) {
      for (const section of getNavigation(role)) {
        for (const item of section.items) {
          expect(
            (await go(item.href, signedIn(role))).redirectedTo,
            `${role}: ${item.href}`,
          ).toBeNull();
        }
      }
    }
  });
});
