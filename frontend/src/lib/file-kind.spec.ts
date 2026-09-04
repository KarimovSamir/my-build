import { describe, expect, it } from "vitest";

import { FILE_EXTENSION_MIME } from "@/lib/types";

import { isImageFileName, isImageMimeType } from "./file-kind";

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
