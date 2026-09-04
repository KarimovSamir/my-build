import { describe, expect, it } from "vitest";

import { ORDER_LIMITS } from "@/lib/types";

import {
  emptyWorkFilesForm,
  toVerifiedAreaBody,
  toWorkFilesFormData,
  validateWorkFilesForm,
} from "./work-form";

function pdf(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "application/pdf" });
}

describe("validateWorkFilesForm", () => {
  it("пустая форма требует и файл, и комментарий", () => {
    const errors = validateWorkFilesForm(emptyWorkFilesForm);

    expect(errors.comment).toBeDefined();
    expect(errors.files).toBeDefined();
  });

  it("комментарий из одних пробелов не считается заполненным", () => {
    const errors = validateWorkFilesForm({ comment: "   ", files: [pdf("план.pdf")] });

    expect(errors.comment).toBeDefined();
  });

  it("файл без комментария не пропускается", () => {
    // ТЗ §4.1 требует оба: клиент должен понимать, что именно ему прислали.
    const errors = validateWorkFilesForm({ comment: "", files: [pdf("план.pdf")] });

    expect(errors.comment).toBeDefined();
    expect(errors.files).toBeUndefined();
  });

  it("слишком длинный комментарий отклоняется", () => {
    const errors = validateWorkFilesForm({
      comment: "я".repeat(ORDER_LIMITS.comment.max + 1),
      files: [pdf("план.pdf")],
    });

    expect(errors.comment).toBeDefined();
  });

  it("заполненная форма ошибок не даёт", () => {
    expect(
      validateWorkFilesForm({ comment: "Готово", files: [pdf("план.pdf")] }),
    ).toEqual({});
  });
});

describe("toWorkFilesFormData", () => {
  it("собирает multipart с обрезанным комментарием и всеми файлами", () => {
    const body = toWorkFilesFormData({
      comment: "  Первый этаж готов  ",
      files: [pdf("первый.pdf"), pdf("второй.pdf")],
    });

    expect(body.get("comment")).toBe("Первый этаж готов");
    expect(body.getAll("files")).toHaveLength(2);
  });
});

describe("toVerifiedAreaBody", () => {
  it("отправляет число, приняв запятую как разделитель", () => {
    expect(toVerifiedAreaBody("62,5")).toEqual({ verifiedSquareMeters: 62.5 });
  });

  it("пробелы вокруг значения не мешают", () => {
    expect(toVerifiedAreaBody(" 100 ")).toEqual({ verifiedSquareMeters: 100 });
  });
});
