import { describe, expect, it } from "vitest";

import {
  MAX_FILES_PER_REQUEST,
  MAX_FILE_SIZE_BYTES,
  ObjectType,
  OrderCategory,
  ORDER_LIMITS,
} from "@/lib/types";

import { todayIsoDate } from "./form-input";
import {
  addFiles,
  emptyOrderForm,
  fileRejectionReason,
  toOrderFormData,
  validateOrderForm,
  type OrderFormValues,
} from "./order-form";

/** Заведомо правильная форма: от неё отталкиваются проверки отдельных полей. */
const validForm: OrderFormValues = {
  title: "Ремонт кухни",
  category: OrderCategory.PLAN_IMPLEMENTATION,
  objectType: ObjectType.APARTMENT,
  description: "Нужно поменять проводку и положить плитку",
  squareMeters: "62.5",
  clientBudget: "150000",
  desiredStartDate: "",
  address: "Баку, улица Низами, 10",
};

function form(patch: Partial<OrderFormValues>): OrderFormValues {
  return { ...validForm, ...patch };
}

/** Файл заданного размера: содержимое роли не играет, проверяется только размер. */
function file(name: string, sizeBytes = 1024): File {
  return new File([new Uint8Array(sizeBytes)], name);
}

/** Дата со сдвигом от сегодняшнего дня по UTC — той же границей меряет backend. */
function isoDateShifted(days: number): string {
  const date = new Date(`${todayIsoDate()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

describe("validateOrderForm", () => {
  it("правильно заполненную форму пропускает", () => {
    expect(validateOrderForm(validForm)).toEqual({});
  });

  it("на пустой форме сообщает про каждое обязательное поле", () => {
    const errors = validateOrderForm(emptyOrderForm);

    expect(Object.keys(errors).sort()).toEqual([
      "address",
      "category",
      "description",
      "objectType",
      "squareMeters",
      "title",
    ]);
    expect(errors.title).toBe("Укажите название заказа");
    expect(errors.category).toBe("Выберите категорию заказа");
  });

  it("проверяет длину названия по обеим границам", () => {
    expect(validateOrderForm(form({ title: "а".repeat(ORDER_LIMITS.title.min - 1) })).title)
      .toBeDefined();
    expect(validateOrderForm(form({ title: "а".repeat(ORDER_LIMITS.title.max + 1) })).title)
      .toBeDefined();
    expect(validateOrderForm(form({ title: "а".repeat(ORDER_LIMITS.title.max) })).title)
      .toBeUndefined();
  });

  it("проверяет длину описания и адреса", () => {
    expect(
      validateOrderForm(form({ description: "а".repeat(ORDER_LIMITS.description.min - 1) }))
        .description,
    ).toBeDefined();
    expect(
      validateOrderForm(form({ address: "а".repeat(ORDER_LIMITS.address.min - 1) })).address,
    ).toBeDefined();
  });

  it("не считает пробелы содержимым поля", () => {
    const errors = validateOrderForm(form({ title: "   ", description: "   " }));

    expect(errors.title).toBe("Укажите название заказа");
    expect(errors.description).toBe("Опишите, что нужно сделать");
  });

  it("проверяет площадь", () => {
    expect(validateOrderForm(form({ squareMeters: "" })).squareMeters).toBe(
      "Укажите площадь объекта",
    );
    expect(validateOrderForm(form({ squareMeters: "сто" })).squareMeters).toBeDefined();
    expect(validateOrderForm(form({ squareMeters: "62.555" })).squareMeters).toBeDefined();
    expect(validateOrderForm(form({ squareMeters: "0" })).squareMeters).toBe(
      "Площадь должна быть больше нуля",
    );
    expect(
      validateOrderForm(form({ squareMeters: String(ORDER_LIMITS.squareMeters.max + 1) }))
        .squareMeters,
    ).toBeDefined();
  });

  it("принимает запятую и в площади, и в бюджете", () => {
    // Соседние поля обязаны вести себя одинаково (находка 3-Н7).
    const errors = validateOrderForm(form({ squareMeters: "62,5", clientBudget: "45000,50" }));

    expect(errors.squareMeters).toBeUndefined();
    expect(errors.clientBudget).toBeUndefined();
  });

  it("проверяет бюджет по формату колонки Decimal(12, 2)", () => {
    expect(validateOrderForm(form({ clientBudget: "150000.50" })).clientBudget).toBeUndefined();
    expect(validateOrderForm(form({ clientBudget: "много" })).clientBudget).toBeDefined();
    expect(validateOrderForm(form({ clientBudget: "150000.505" })).clientBudget).toBeDefined();
    expect(validateOrderForm(form({ clientBudget: "1".repeat(11) })).clientBudget).toBeDefined();
  });

  it("бюджет не обязателен", () => {
    expect(validateOrderForm(form({ clientBudget: "   " })).clientBudget).toBeUndefined();
  });

  it("проверяет желаемую дату начала", () => {
    expect(validateOrderForm(form({ desiredStartDate: "04.09.2026" })).desiredStartDate).toBe(
      "Некорректная желаемая дата начала",
    );
    expect(validateOrderForm(form({ desiredStartDate: isoDateShifted(-1) })).desiredStartDate)
      .toBe("Желаемая дата начала не может быть в прошлом");
    expect(validateOrderForm(form({ desiredStartDate: todayIsoDate() })).desiredStartDate)
      .toBeUndefined();
    expect(validateOrderForm(form({ desiredStartDate: isoDateShifted(1) })).desiredStartDate)
      .toBeUndefined();
  });
});

describe("toOrderFormData", () => {
  it("отправляет обязательные поля без лишних пробелов", () => {
    const body = toOrderFormData(form({ title: "  Ремонт кухни  " }), []);

    expect(body.get("title")).toBe("Ремонт кухни");
    expect(body.get("category")).toBe(OrderCategory.PLAN_IMPLEMENTATION);
    expect(body.get("objectType")).toBe(ObjectType.APARTMENT);
    expect(body.get("address")).toBe(validForm.address);
  });

  it("превращает запятую в точку у площади и бюджета", () => {
    const body = toOrderFormData(form({ squareMeters: "62,5", clientBudget: "45000,50" }), []);

    expect(body.get("squareMeters")).toBe("62.5");
    expect(body.get("clientBudget")).toBe("45000.50");
  });

  it("не отправляет незаполненные необязательные поля", () => {
    // `ValidationPipe` настроен на `forbidNonWhitelisted`: пустая строка
    // в необязательном поле — это 400, а не «значения нет».
    const body = toOrderFormData(form({ clientBudget: "  ", desiredStartDate: "  " }), []);

    expect(body.has("clientBudget")).toBe(false);
    expect(body.has("desiredStartDate")).toBe(false);
  });

  it("кладёт все файлы под ключ files", () => {
    const files = [file("план.pdf"), file("фасад.png")];
    const body = toOrderFormData(validForm, files);

    expect(body.getAll("files")).toHaveLength(2);
  });
});

describe("fileRejectionReason", () => {
  it("разрешённое расширение пропускает независимо от регистра", () => {
    expect(fileRejectionReason(file("план.pdf"))).toBeNull();
    expect(fileRejectionReason(file("ПЛАН.PDF"))).toBeNull();
    expect(fileRejectionReason(file("чертёж.dwg"))).toBeNull();
  });

  it("отклоняет чужое расширение и файл без расширения", () => {
    expect(fileRejectionReason(file("вирус.exe"))).toContain("такой тип загрузить нельзя");
    expect(fileRejectionReason(file("readme"))).toContain("такой тип загрузить нельзя");
  });

  it("отклоняет пустой файл", () => {
    expect(fileRejectionReason(file("план.pdf", 0))).toContain("файл пустой");
  });

  it("отклоняет файл больше лимита", () => {
    expect(fileRejectionReason(file("план.pdf", MAX_FILE_SIZE_BYTES + 1))).toContain("больше");
    expect(fileRejectionReason(file("план.pdf", MAX_FILE_SIZE_BYTES))).toBeNull();
  });
});

describe("addFiles", () => {
  it("добавляет новые файлы к уже приложенным", () => {
    const { files, rejected } = addFiles([file("план.pdf")], [file("фасад.png")]);

    expect(files.map((item) => item.name)).toEqual(["план.pdf", "фасад.png"]);
    expect(rejected).toEqual([]);
  });

  it("молча пропускает повторно выбранный файл", () => {
    const { files, rejected } = addFiles([file("план.pdf", 100)], [file("план.pdf", 100)]);

    expect(files).toHaveLength(1);
    expect(rejected).toEqual([]);
  });

  it("файл с тем же именем, но другого размера — другой файл", () => {
    const { files } = addFiles([file("план.pdf", 100)], [file("план.pdf", 200)]);

    expect(files).toHaveLength(2);
  });

  it("не пускает отклонённый файл в список и называет причину", () => {
    const { files, rejected } = addFiles([], [file("вирус.exe"), file("план.pdf")]);

    expect(files.map((item) => item.name)).toEqual(["план.pdf"]);
    expect(rejected).toHaveLength(1);
  });

  it("держит потолок числа файлов за раз", () => {
    const incoming = Array.from({ length: MAX_FILES_PER_REQUEST + 1 }, (_, index) =>
      file(`план-${index}.pdf`),
    );

    const { files, rejected } = addFiles([], incoming);

    expect(files).toHaveLength(MAX_FILES_PER_REQUEST);
    expect(rejected).toEqual([
      `Больше ${MAX_FILES_PER_REQUEST} файлов за раз приложить нельзя`,
    ]);
  });
});
