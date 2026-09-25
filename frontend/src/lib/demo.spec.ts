import { describe, expect, it } from "vitest";

import { signOutScope } from "./demo";

describe("signOutScope", () => {
  it("обычная учётка выходит на всех устройствах (ТЗ §5)", () => {
    expect(signOutScope(false)).toBe("global");
  });

  it("демо-учётка — только на этом: ею пользуются все посетители", () => {
    // `global` отозвал бы refresh-токены остальных, и через час их выкинуло бы.
    expect(signOutScope(true)).toBe("local");
  });
});
