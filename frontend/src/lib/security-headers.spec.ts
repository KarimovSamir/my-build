import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, securityHeaders } from "./security-headers";

/** Значение одной директивы CSP — список источников. */
function directive(policy: string, name: string): string[] {
  const found = policy
    .split("; ")
    .map((part) => part.split(" "))
    .find(([key]) => key === name);

  return found ? found.slice(1) : [];
}

const PROD = {
  apiUrl: "https://mybuild-api.onrender.com",
  supabaseUrl: "https://abcdefgh.supabase.co",
  dev: false,
};

describe("contentSecurityPolicy", () => {
  it("пускает запросы только к своему API, его сокету и Supabase", () => {
    expect(directive(contentSecurityPolicy(PROD), "connect-src")).toEqual([
      "'self'",
      "https://mybuild-api.onrender.com",
      "wss://mybuild-api.onrender.com",
      "https://abcdefgh.supabase.co",
    ]);
  });

  it("берёт адрес сокета из своей переменной, если она задана", () => {
    const policy = contentSecurityPolicy({ ...PROD, wsUrl: "https://ws.example.com/" });

    expect(directive(policy, "connect-src")).toContain("wss://ws.example.com");
  });

  it("без переменных пускает туда же, куда ходит клиент API по умолчанию", () => {
    const policy = contentSecurityPolicy({ dev: false });

    expect(directive(policy, "connect-src")).toEqual([
      "'self'",
      "http://localhost:4000",
      "ws://localhost:4000",
    ]);
  });

  it("не даёт встроить страницу в чужой фрейм и подгрузить чужие скрипты", () => {
    const policy = contentSecurityPolicy(PROD);

    expect(directive(policy, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(policy, "script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directive(policy, "object-src")).toEqual(["'none'"]);
  });

  it("разрешает eval только в разработке", () => {
    expect(directive(contentSecurityPolicy({ ...PROD, dev: true }), "script-src")).toContain(
      "'unsafe-eval'",
    );
  });

  it("картинки — только свои, иначе токен уходил бы адресом картинки", () => {
    expect(directive(contentSecurityPolicy(PROD), "img-src")).toEqual([
      "'self'",
      "data:",
      "blob:",
    ]);
  });
});

describe("securityHeaders", () => {
  it("запрещает фреймы и угадывание типа", () => {
    const headers = new Map(securityHeaders(PROD).map(({ key, value }) => [key, value]));

    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
