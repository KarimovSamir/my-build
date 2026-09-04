import { describe, expect, it } from "vitest";

import { Role, type UserProfile } from "@/lib/types";

import { readEmailVerifiedClaim, readRoleClaim, toCurrentUser } from "./session";

function profile(patch: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "6f1c7a0e-0000-4000-8000-000000000001",
    email: "client@example.com",
    role: Role.CLIENT,
    firstName: "Иван",
    lastName: "Петров",
    phone: "+994501234567",
    companyName: null,
    city: "Баку",
    country: "Азербайджан",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...patch,
  };
}

describe("readRoleClaim", () => {
  it("читает известные роли", () => {
    expect(readRoleClaim("CLIENT")).toBe(Role.CLIENT);
    expect(readRoleClaim("COMPANY")).toBe(Role.COMPANY);
  });

  it("всё остальное считает отсутствием роли", () => {
    // Хук Supabase может быть выключен или вернуть что угодно — доверять
    // этому значению без проверки нельзя.
    for (const claim of ["ADMIN", "", undefined, null, 1, {}, ["CLIENT"]]) {
      expect(readRoleClaim(claim)).toBeNull();
    }
  });
});

describe("readEmailVerifiedClaim", () => {
  it("подтверждённым считает всё, кроме явного false", () => {
    // Claim'а нет — значит, хук выключен, а тогда нет и роли, и кабинет
    // закрыт по другой причине. Так же рассуждает backend.
    expect(readEmailVerifiedClaim(true)).toBe(true);
    expect(readEmailVerifiedClaim(undefined)).toBe(true);
  });

  it("не подтверждённым — только явный false", () => {
    expect(readEmailVerifiedClaim(false)).toBe(false);
  });
});

describe("toCurrentUser", () => {
  it("компанию называет по названию, а не по имени человека", () => {
    const user = toCurrentUser(
      profile({ role: Role.COMPANY, companyName: "Ремонт Плюс", firstName: "Пётр" }),
    );

    expect(user.displayName).toBe("Ремонт Плюс");
    expect(user.roleLabel).toBe("Компания");
    expect(user.initial).toBe("Р");
  });

  it("компанию без названия называет по имени", () => {
    const user = toCurrentUser(profile({ role: Role.COMPANY, companyName: null }));

    expect(user.displayName).toBe("Иван Петров");
  });

  it("клиента называет по имени и фамилии", () => {
    const user = toCurrentUser(profile());

    expect(user.displayName).toBe("Иван Петров");
    expect(user.roleLabel).toBe("Клиент");
    expect(user.initial).toBe("И");
  });

  it("клиента без фамилии называет по имени, без хвостового пробела", () => {
    expect(toCurrentUser(profile({ lastName: null })).displayName).toBe("Иван");
  });

  it("сохраняет поля профиля как есть", () => {
    const source = profile();

    expect(toCurrentUser(source)).toMatchObject(source);
  });

  it("без имени показывает вопросительный знак вместо буквы аватара", () => {
    const user = toCurrentUser(profile({ firstName: "", lastName: null }));

    expect(user.initial).toBe("?");
  });
});
