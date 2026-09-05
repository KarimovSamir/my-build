import { describe, expect, it } from "vitest";

import { FileOwnerType, ORDER_LIMITS, type OrderFileDto } from "@/lib/types";

import {
  countRoundFiles,
  describeUpload,
  emptyWorkFilesForm,
  toVerifiedAreaBody,
  toWorkFilesFormData,
  validateWorkFilesForm,
} from "./work-form";

function pdf(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "application/pdf" });
}

function file(ownerType: FileOwnerType, submissionRound: number): OrderFileDto {
  return {
    id: `file-${ownerType}-${submissionRound}-${Math.random()}`,
    orderId: "order-1",
    ownerType,
    submissionRound,
    originalName: "акт.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
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

describe("countRoundFiles", () => {
  it("считает только файлы компании и только своего раунда", () => {
    const order = {
      files: [
        file(FileOwnerType.CLIENT, 0),
        file(FileOwnerType.COMPANY, 1),
        file(FileOwnerType.COMPANY, 1),
        file(FileOwnerType.COMPANY, 2),
      ],
    };

    expect(countRoundFiles(order, 1)).toBe(2);
    expect(countRoundFiles(order, 2)).toBe(1);
    expect(countRoundFiles(order, 3)).toBe(0);
  });
});

describe("describeUpload", () => {
  it("добавленные файлы обещают уведомление клиенту", () => {
    const outcome = describeUpload(2, 3);

    expect(outcome.changed).toBe(true);
    expect(outcome.title).toBe("Файлы загружены");
    expect(outcome.description).toContain("Сдача №3");
    expect(outcome.description).toContain("2");
  });

  it("один файл называется в единственном числе", () => {
    expect(describeUpload(1, 1).title).toBe("Файл загружен");
  });

  it("повторная загрузка тех же файлов уведомления не обещает", () => {
    // Дедупликация по SHA-256 в пределах сдачи (ТЗ §4.1): в заказе ничего
    // не изменилось, и backend уведомление клиенту не создаёт.
    const outcome = describeUpload(0, 2);

    expect(outcome.changed).toBe(false);
    expect(outcome.title).toBe("Новых файлов нет");
    expect(outcome.description).toContain("уже приложены");
    expect(outcome.description).not.toContain("уведомление");
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
