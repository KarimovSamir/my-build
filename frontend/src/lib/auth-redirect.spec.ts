import { beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_ISSUE_PAGES } from "@/lib/navigation";
import { Role } from "@/lib/types";

import { resolveAfterAuthHref } from "./auth-redirect";
import { getSupabaseBrowserClient } from "./supabase/client";

// Единственная зависимость модуля, ходящая наружу: токен и claim'ы в нём.
// Проверяется решение о переходе, а не работа Supabase.
vi.mock("./supabase/client", () => ({ getSupabaseBrowserClient: vi.fn() }));

const getClaims = vi.fn();

beforeEach(() => {
  getClaims.mockReset();
  vi.mocked(getSupabaseBrowserClient).mockReturnValue({
    auth: { getClaims },
  } as unknown as ReturnType<typeof getSupabaseBrowserClient>);
});

/** Ответ `getClaims()` с заданным значением claim'а `user_role`. */
function withRoleClaim(claim: unknown) {
  getClaims.mockResolvedValue({ data: { claims: { user_role: claim } } });
}

describe("resolveAfterAuthHref", () => {
  it("возвращает страницу, на которую человек шёл", async () => {
    await expect(resolveAfterAuthHref("/orders/42")).resolves.toBe("/orders/42");

    // Токен ради этого не запрашивается: адрес уже известен.
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("без цели ведёт в кабинет по роли", async () => {
    withRoleClaim(Role.COMPANY);
    await expect(resolveAfterAuthHref()).resolves.toBe("/available");

    withRoleClaim(Role.CLIENT);
    await expect(resolveAfterAuthHref("/")).resolves.toBe("/orders");
  });

  it("без роли в токене ведёт на служебный экран", async () => {
    // Так выглядит выключенный Custom Access Token Hook: кабинета для такого
    // пользователя нет, и лендинг вернул бы его сюда же по кругу.
    withRoleClaim(undefined);

    await expect(resolveAfterAuthHref("/")).resolves.toBe(
      SESSION_ISSUE_PAGES.missingRole,
    );
  });

  it("не спотыкается о неожиданный ответ", async () => {
    withRoleClaim("ADMIN");
    await expect(resolveAfterAuthHref("/")).resolves.toBe(
      SESSION_ISSUE_PAGES.missingRole,
    );

    getClaims.mockResolvedValue({ data: null });
    await expect(resolveAfterAuthHref("/")).resolves.toBe(
      SESSION_ISSUE_PAGES.missingRole,
    );
  });
});
