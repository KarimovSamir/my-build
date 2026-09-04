import { describe, expect, it } from "vitest";

import { ORDER_LIMITS } from "@/lib/types";

import { validateCompletionComment, validateCorrectionComment } from "./completion-form";

const tooLong = "я".repeat(ORDER_LIMITS.comment.max + 1);

describe("validateCompletionComment", () => {
  it("пропускает пустой комментарий: он необязателен", () => {
    expect(validateCompletionComment("")).toBeUndefined();
    expect(validateCompletionComment("   ")).toBeUndefined();
  });

  it("пропускает обычный текст", () => {
    expect(validateCompletionComment("Всё сделано в срок")).toBeUndefined();
  });

  it("не пропускает слишком длинный", () => {
    expect(validateCompletionComment(tooLong)).toBe(
      `Комментарий — не более ${ORDER_LIMITS.comment.max} символов`,
    );
  });

  it("длину считает по обрезанной строке", () => {
    expect(
      validateCompletionComment(`  ${"я".repeat(ORDER_LIMITS.comment.max)}  `),
    ).toBeUndefined();
  });
});

describe("validateCorrectionComment", () => {
  it("требует объяснить, что доработать", () => {
    expect(validateCorrectionComment("")).toBe("Опишите, что нужно доработать");
    // Пробелы — не объяснение: backend их тоже срежет (`trim` в DTO).
    expect(validateCorrectionComment("   ")).toBe("Опишите, что нужно доработать");
  });

  it("пропускает заполненный", () => {
    expect(validateCorrectionComment("Не хватает размеров санузла")).toBeUndefined();
  });

  it("не пропускает слишком длинный", () => {
    expect(validateCorrectionComment(tooLong)).toBe(
      `Комментарий — не более ${ORDER_LIMITS.comment.max} символов`,
    );
  });
});
