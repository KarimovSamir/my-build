import { describe, expect, it } from "vitest";

import { pluralRu } from "./plural";

const FORMS = ["компания", "компании", "компаний"] as const;

describe("pluralRu", () => {
  it("выбирает форму по последней цифре", () => {
    expect(pluralRu(1, FORMS)).toBe("компания");
    expect(pluralRu(2, FORMS)).toBe("компании");
    expect(pluralRu(4, FORMS)).toBe("компании");
    expect(pluralRu(5, FORMS)).toBe("компаний");
    expect(pluralRu(21, FORMS)).toBe("компания");
    expect(pluralRu(102, FORMS)).toBe("компании");
  });

  it("второй десяток идёт с формой «много»", () => {
    for (const count of [11, 12, 13, 14, 111, 114]) {
      expect(pluralRu(count, FORMS), String(count)).toBe("компаний");
    }
  });

  it("ноль — тоже «много»", () => {
    expect(pluralRu(0, FORMS)).toBe("компаний");
  });
});
