import { describe, expect, it } from "vitest";

import { ALLOWED_FILE_MIME_TYPES, FILE_EXTENSION_MIME } from "@/lib/types";

import { fileKindLabel, isImageFileName, isImageMimeType } from "./file-kind";

describe("isImageMimeType", () => {
  it.each(["image/png", "image/jpeg", "image/webp"])("%s — картинка", (mime) => {
    expect(isImageMimeType(mime)).toBe(true);
  });

  it("чертёж картинкой не считается, хотя его тип начинается с image/", () => {
    // Ради этого случая правило и вынесено: `image/vnd.dwg` проходил проверку
    // по префиксу, и DWG показывался иконкой фотографии (находка R3-Н2).
    expect(isImageMimeType(FILE_EXTENSION_MIME[".dwg"]!)).toBe(false);
    expect(isImageMimeType("application/dxf")).toBe(false);
    expect(isImageMimeType("application/pdf")).toBe(false);
  });

  it("не смотрит на регистр и параметры после точки с запятой", () => {
    expect(isImageMimeType("IMAGE/PNG")).toBe(true);
    expect(isImageMimeType("image/jpeg; charset=binary")).toBe(true);
  });
});

describe("fileKindLabel", () => {
  it.each([
    ["application/pdf", "PDF"],
    ["image/vnd.dwg", "DWG"],
    ["application/dxf", "DXF"],
    ["image/png", "PNG"],
    ["image/jpeg", "JPEG"],
    ["image/webp", "WEBP"],
  ])("%s называется %s", (mime, label) => {
    expect(fileKindLabel(mime)).toBe(label);
  });

  it("у каждого разрешённого типа есть название", () => {
    // Иначе новый тип в allowlist приезжал бы в список как «Файл».
    for (const mime of ALLOWED_FILE_MIME_TYPES) {
      expect(fileKindLabel(mime)).not.toBe("Файл");
    }
  });

  it("не смотрит на регистр и параметры после точки с запятой", () => {
    expect(fileKindLabel("APPLICATION/PDF; charset=binary")).toBe("PDF");
  });

  it("незнакомый тип называется нейтрально", () => {
    // Строки со старым типом остаются в базе после смены allowlist.
    expect(fileKindLabel("application/zip")).toBe("Файл");
    expect(fileKindLabel("")).toBe("Файл");
  });
});

describe("isImageFileName", () => {
  it.each(["план.png", "ФОТО.JPG", "снимок.jpeg", "вид.webp"])(
    "%s — картинка",
    (name) => {
      expect(isImageFileName(name)).toBe(true);
    },
  );

  it.each(["чертёж.dwg", "обмен.dxf", "смета.pdf", "README", "архив.zip"])(
    "%s — не картинка",
    (name) => {
      expect(isImageFileName(name)).toBe(false);
    },
  );

  it("даёт тот же ответ, что и правило по типу", () => {
    // Два места на фронте (форма и карточка заказа) должны решать одинаково.
    for (const [extension, mime] of Object.entries(FILE_EXTENSION_MIME)) {
      expect(isImageFileName(`файл${extension}`)).toBe(isImageMimeType(mime));
    }
  });
});
