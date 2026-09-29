import { describe, expect, it } from "vitest";

import { callbackPurpose, parseCallbackLink, readTokenEmail } from "./callback-link";

/** Access-токен с нужной нагрузкой. Подпись не проверяется — она и не нужна. */
function tokenWith(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `header.${payload}.signature`;
}

describe("parseCallbackLink", () => {
  it("узнаёт токены во фрагменте и достаёт почту для показа", () => {
    const hash = `access_token=${tokenWith({ email: "anna@example.test" })}&refresh_token=r1&type=invite`;

    expect(parseCallbackLink(hash, new URLSearchParams())).toMatchObject({
      kind: "session",
      refreshToken: "r1",
      email: "anna@example.test",
    });
  });

  it("узнаёт одноразовый token_hash с известным типом", () => {
    const search = new URLSearchParams({ token_hash: "abc", type: "recovery" });

    expect(parseCallbackLink("", search)).toEqual({
      kind: "otp",
      tokenHash: "abc",
      type: "recovery",
    });
  });

  it("неизвестный тип и неполные токены — битая ссылка", () => {
    expect(parseCallbackLink("", new URLSearchParams({ token_hash: "abc", type: "hack" }))).toBeNull();
    expect(parseCallbackLink("access_token=a", new URLSearchParams())).toBeNull();
    expect(parseCallbackLink("", new URLSearchParams())).toBeNull();
  });
});

describe("readTokenEmail", () => {
  it("мусор вместо токена — почты нет, а не исключение", () => {
    expect(readTokenEmail("не-токен")).toBeNull();
    expect(readTokenEmail("a.%%%.c")).toBeNull();
    expect(readTokenEmail(tokenWith({ sub: "u1" }))).toBeNull();
  });
});

describe("callbackPurpose", () => {
  it("называет учётную запись, которая откроется", () => {
    // Ради этого экран и есть: чужую ссылку видно по чужому адресу.
    expect(
      callbackPurpose({ kind: "session", accessToken: "a", refreshToken: "r", email: "evil@example.test" }),
    ).toContain("evil@example.test");
  });

  it("для сброса пароля говорит о новом пароле", () => {
    expect(callbackPurpose({ kind: "otp", tokenHash: "h", type: "recovery" })).toContain(
      "новый пароль",
    );
  });
});
