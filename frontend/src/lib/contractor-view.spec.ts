import { describe, expect, it } from "vitest";

import type { ContractorCard } from "@/lib/types";

import {
  completedOrdersText,
  contractorContacts,
  contractorLocation,
} from "./contractor-view";

const contractor: ContractorCard = {
  id: "6f1c7a0e-0000-4000-8000-000000000001",
  companyName: "СтройГрад",
  city: "Москва",
  country: "Россия",
  email: "info@stroygrad.mybuild.test",
  phone: "+7 900 000-00-00",
  completedOrdersCount: 3,
};

describe("contractorLocation", () => {
  it("собирает город и страну одной строкой", () => {
    expect(contractorLocation(contractor)).toBe("Москва, Россия");
  });

  it("обходится тем, что заполнено", () => {
    expect(contractorLocation({ city: "Казань", country: null })).toBe("Казань");
    expect(contractorLocation({ city: null, country: "Россия" })).toBe("Россия");
  });

  it("без города и страны даёт null: подпись выбирает экран", () => {
    expect(contractorLocation({ city: null, country: null })).toBeNull();
    // Пробелы в колонке — это тоже «не указано», а не город с именем из пробела.
    expect(contractorLocation({ city: "  ", country: "" })).toBeNull();
  });
});

describe("completedOrdersText", () => {
  it("склоняет «заказ» по числу", () => {
    expect(completedOrdersText(1)).toBe("1 завершённый заказ");
    expect(completedOrdersText(3)).toBe("3 завершённых заказа");
    expect(completedOrdersText(7)).toBe("7 завершённых заказов");
  });

  it("второй десяток идёт с «заказов», хотя оканчивается на 1–4", () => {
    expect(completedOrdersText(11)).toBe("11 завершённых заказов");
    expect(completedOrdersText(14)).toBe("14 завершённых заказов");
    expect(completedOrdersText(21)).toBe("21 завершённый заказ");
    expect(completedOrdersText(102)).toBe("102 завершённых заказа");
  });

  it("ноль объясняется словами, а не показателем «0»", () => {
    expect(completedOrdersText(0)).toBe("Пока нет завершённых заказов");
  });
});

describe("contractorContacts", () => {
  it("даёт почту и телефон ссылками", () => {
    expect(contractorContacts(contractor)).toEqual([
      {
        label: "Email",
        value: "info@stroygrad.mybuild.test",
        href: "mailto:info@stroygrad.mybuild.test",
      },
      { label: "Телефон", value: "+7 900 000-00-00", href: "tel:+79000000000" },
    ]);
  });

  it("в `tel:` уходят только «+» и цифры, показывается — исходный номер", () => {
    const [, phone] = contractorContacts({ ...contractor, phone: "8 (900) 000-00-00" });

    expect(phone).toEqual({
      label: "Телефон",
      value: "8 (900) 000-00-00",
      href: "tel:89000000000",
    });
  });

  it("номер без цифр показывается текстом: звонить некуда", () => {
    const [, phone] = contractorContacts({ ...contractor, phone: "—" });

    expect(phone?.href).toBeNull();
  });
});
