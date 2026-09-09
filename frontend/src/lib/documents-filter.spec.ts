import { describe, expect, it } from "vitest";

import { FileOwnerType } from "@/lib/types";

import {
  documentsFilterKey,
  documentsHref,
  isEmptyDocumentsFilter,
  parseDocumentsFilter,
  type DocumentsFilter,
} from "./documents-filter";

const ORDER_ID = "3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607";

describe("parseDocumentsFilter", () => {
  it("читает оба фильтра и страницу", () => {
    expect(
      parseDocumentsFilter({ ownerType: "COMPANY", orderId: ORDER_ID, page: "3" }),
    ).toEqual({
      ownerType: FileOwnerType.COMPANY,
      orderId: ORDER_ID,
      page: 3,
    });
  });

  it("без параметров даёт первую страницу без фильтров", () => {
    expect(parseDocumentsFilter({})).toEqual({
      ownerType: null,
      orderId: null,
      page: 1,
    });
  });

  it("неизвестный владелец читается как «все»", () => {
    expect(parseDocumentsFilter({ ownerType: "SOMEBODY" }).ownerType).toBeNull();
  });

  it("не-UUID в заказе отбрасывается: backend ответил бы на него 400", () => {
    expect(parseDocumentsFilter({ orderId: "not-a-uuid" }).orderId).toBeNull();
    expect(parseDocumentsFilter({ orderId: `${ORDER_ID} ` }).orderId).toBeNull();
    expect(parseDocumentsFilter({ orderId: "" }).orderId).toBeNull();
  });

  it("из повторяющегося параметра берётся первое значение", () => {
    expect(parseDocumentsFilter({ ownerType: ["CLIENT", "COMPANY"] }).ownerType).toBe(
      FileOwnerType.CLIENT,
    );
  });
});

describe("documentsHref", () => {
  it("без фильтров — чистый адрес раздела", () => {
    expect(documentsHref()).toBe("/documents");
    expect(documentsHref({ page: 1 })).toBe("/documents");
  });

  it("собирает оба фильтра и страницу", () => {
    expect(
      documentsHref({ ownerType: FileOwnerType.COMPANY, orderId: ORDER_ID, page: 2 }),
    ).toBe(`/documents?ownerType=COMPANY&orderId=${ORDER_ID}&page=2`);
  });

  it("разобранный адрес собирается обратно без потерь", () => {
    const filter: DocumentsFilter = {
      ownerType: FileOwnerType.CLIENT,
      orderId: ORDER_ID,
      page: 4,
    };

    expect(parseDocumentsFilter(Object.fromEntries(new URLSearchParams(documentsHref(filter).split("?")[1])))).toEqual(
      filter,
    );
  });
});

describe("isEmptyDocumentsFilter", () => {
  it("страница фильтром не считается", () => {
    expect(
      isEmptyDocumentsFilter({ ownerType: null, orderId: null, page: 5 }),
    ).toBe(true);
  });

  it("любой из двух фильтров делает выборку непустой", () => {
    expect(
      isEmptyDocumentsFilter({ ownerType: FileOwnerType.CLIENT, orderId: null, page: 1 }),
    ).toBe(false);
    expect(
      isEmptyDocumentsFilter({ ownerType: null, orderId: ORDER_ID, page: 1 }),
    ).toBe(false);
  });
});

describe("documentsFilterKey", () => {
  it("различает выборки, отличающиеся любым из полей", () => {
    const base: DocumentsFilter = { ownerType: null, orderId: null, page: 1 };

    const keys = new Set([
      documentsFilterKey(base),
      documentsFilterKey({ ...base, ownerType: FileOwnerType.CLIENT }),
      documentsFilterKey({ ...base, orderId: ORDER_ID }),
      documentsFilterKey({ ...base, page: 2 }),
    ]);

    expect(keys.size).toBe(4);
  });
});
