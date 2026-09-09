import { describe, expect, it } from "vitest";

import { FileOwnerType, Role } from "@/lib/types";

import {
  documentOwnerLabel,
  documentOwnerTabLabel,
  toOrderOptions,
  withSelectedOrder,
} from "./document-view";

const orders = [
  { id: "a", orderNumber: 12, title: "Ремонт кухни" },
  { id: "b", orderNumber: 40, title: "Кровля склада" },
];

describe("toOrderOptions", () => {
  it("подписывает заказ номером и названием", () => {
    expect(toOrderOptions([orders[0]!])).toEqual([
      { id: "a", label: "ORD-12 · Ремонт кухни" },
    ]);
  });

  it("ставит заказы по номеру сверху вниз", () => {
    expect(toOrderOptions(orders).map((option) => option.id)).toEqual(["b", "a"]);
  });

  it("повтор заказа даёт один вариант", () => {
    expect(toOrderOptions([...orders, orders[0]!])).toHaveLength(2);
  });

  it("пустой список — пустые варианты", () => {
    expect(toOrderOptions([])).toEqual([]);
  });
});

describe("withSelectedOrder", () => {
  const options = toOrderOptions(orders);

  it("без выбора список не меняется", () => {
    expect(withSelectedOrder(options, null)).toEqual(options);
  });

  it("выбранный заказ из списка не дублируется", () => {
    expect(withSelectedOrder(options, "a")).toEqual(options);
  });

  it("выбранный заказ вне списка добавляется первым", () => {
    const result = withSelectedOrder(options, "z");

    expect(result[0]).toEqual({ id: "z", label: "Выбранный заказ" });
    expect(result).toHaveLength(options.length + 1);
  });
});

describe("documentOwnerLabel", () => {
  it("свои файлы называет своими", () => {
    expect(documentOwnerLabel(FileOwnerType.CLIENT, Role.CLIENT)).toBe("Ваш файл");
    expect(documentOwnerLabel(FileOwnerType.COMPANY, Role.COMPANY)).toBe("Ваш файл");
  });

  it("чужие — по стороне сделки", () => {
    expect(documentOwnerLabel(FileOwnerType.COMPANY, Role.CLIENT)).toBe(
      "Файл исполнителя",
    );
    expect(documentOwnerLabel(FileOwnerType.CLIENT, Role.COMPANY)).toBe("Файл клиента");
  });
});

describe("documentOwnerTabLabel", () => {
  it("вкладка своих файлов называется одинаково в обеих ролях", () => {
    expect(documentOwnerTabLabel(FileOwnerType.CLIENT, Role.CLIENT)).toBe("Мои файлы");
    expect(documentOwnerTabLabel(FileOwnerType.COMPANY, Role.COMPANY)).toBe("Мои файлы");
  });

  it("вкладка чужих файлов называет сторону", () => {
    expect(documentOwnerTabLabel(FileOwnerType.COMPANY, Role.CLIENT)).toBe(
      "Файлы исполнителя",
    );
    expect(documentOwnerTabLabel(FileOwnerType.CLIENT, Role.COMPANY)).toBe(
      "Файлы клиента",
    );
  });
});
