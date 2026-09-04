import { describe, expect, it } from "vitest";

import {
  FileOwnerType,
  ObjectType,
  OfferStatus,
  OrderCategory,
  OrderStatus,
  type OfferDto,
  type OrderDetail,
  type OrderFileDto,
} from "@/lib/types";

import { emptyClientFilesMessage, resolveOrderDetailAccess } from "./order-access";

const CLIENT_ID = "6f1c7a0e-0000-4000-8000-000000000001";
const EXECUTOR_ID = "6f1c7a0e-0000-4000-8000-000000000002";
const OTHER_COMPANY_ID = "6f1c7a0e-0000-4000-8000-000000000003";

function offer(companyId: string, status: OfferStatus): OfferDto {
  return {
    id: `offer-${companyId}`,
    orderId: "order-1",
    companyId,
    companyName: "Ремонт Плюс",
    status,
    proposedPrice: "150000",
    proposedDeadline: "2026-10-01T00:00:00.000Z",
    comment: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function file(ownerType: FileOwnerType, submissionRound = 0): OrderFileDto {
  return {
    id: `file-${ownerType}-${submissionRound}`,
    orderId: "order-1",
    ownerType,
    submissionRound,
    originalName: "план.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

function order(patch: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: "order-1",
    orderNumber: 7829,
    title: "Ремонт кухни",
    status: OrderStatus.IN_PROGRESS,
    category: OrderCategory.PLAN_IMPLEMENTATION,
    objectType: ObjectType.APARTMENT,
    clientBudget: "150000",
    price: null,
    deadline: null,
    contractorName: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    description: "Поменять проводку",
    address: "Баку, улица Низами, 10",
    squareMeters: 62.5,
    verifiedSquareMeters: null,
    desiredStartDate: null,
    clientCompletionComment: null,
    correctionComment: null,
    client: { id: CLIENT_ID, firstName: "Иван", lastName: "Петров", city: null, country: null },
    offers: [],
    files: [],
    submissions: [],
    ...patch,
  };
}

describe("resolveOrderDetailAccess", () => {
  it("владелец — сторона сделки", () => {
    const access = resolveOrderDetailAccess(order(), CLIENT_ID);

    expect(access.isOwner).toBe(true);
    expect(access.isParty).toBe(true);
  });

  it("компания-исполнитель — сторона сделки, но не владелец", () => {
    const access = resolveOrderDetailAccess(
      order({ offers: [offer(EXECUTOR_ID, OfferStatus.ACCEPTED)] }),
      EXECUTOR_ID,
    );

    expect(access.isOwner).toBe(false);
    expect(access.isParty).toBe(true);
  });

  it("компания с отправленным предложением стороной сделки ещё не стала", () => {
    const access = resolveOrderDetailAccess(
      order({ client: null, offers: [offer(OTHER_COMPANY_ID, OfferStatus.SENT)] }),
      OTHER_COMPANY_ID,
    );

    expect(access.isParty).toBe(false);
  });

  it("проигравшая компания стороной сделки не остаётся", () => {
    for (const status of [
      OfferStatus.NOT_ACCEPTED,
      OfferStatus.REJECTED,
      OfferStatus.WITHDRAWN,
    ]) {
      const access = resolveOrderDetailAccess(
        order({ client: null, offers: [offer(OTHER_COMPANY_ID, status)] }),
        OTHER_COMPANY_ID,
      );

      expect(access.isParty, status).toBe(false);
    }
  });

  it("посторонняя компания — не владелец и не сторона сделки", () => {
    // Заказчика ей backend не отдаёт вовсе (ТЗ §4.1), поэтому `client: null`.
    const access = resolveOrderDetailAccess(
      order({ client: null, offers: [offer(EXECUTOR_ID, OfferStatus.ACCEPTED)] }),
      OTHER_COMPANY_ID,
    );

    expect(access.isOwner).toBe(false);
    expect(access.isParty).toBe(false);
  });

  it("пропавшая сессия не даёт прав", () => {
    const access = resolveOrderDetailAccess(
      order({ offers: [offer(EXECUTOR_ID, OfferStatus.ACCEPTED)] }),
      null,
    );

    expect(access.isOwner).toBe(false);
    expect(access.isParty).toBe(false);
  });

  it("чужое принятое предложение прав не даёт", () => {
    const access = resolveOrderDetailAccess(
      order({ client: null, offers: [offer(EXECUTOR_ID, OfferStatus.ACCEPTED)] }),
      OTHER_COMPANY_ID,
    );

    expect(access.isParty).toBe(false);
  });

  it("в файлах задания оставляет только файлы клиента", () => {
    const access = resolveOrderDetailAccess(
      order({
        files: [
          file(FileOwnerType.CLIENT),
          file(FileOwnerType.COMPANY, 1),
          file(FileOwnerType.COMPANY, 2),
        ],
      }),
      CLIENT_ID,
    );

    expect(access.clientFiles).toHaveLength(1);
    expect(access.clientFiles[0]?.ownerType).toBe(FileOwnerType.CLIENT);
  });
});

describe("emptyClientFilesMessage", () => {
  it("посторонней компании не утверждает, что файлов нет", () => {
    // Файлы могут быть — просто не для неё.
    expect(emptyClientFilesMessage({ isOwner: false, isParty: false })).toBe(
      "Файлы задания видны компании, чьё предложение принято.",
    );
  });

  it("владельцу говорит, что файлы не приложил он сам", () => {
    expect(emptyClientFilesMessage({ isOwner: true, isParty: true })).toBe(
      "Вы не приложили файлы к этому заказу.",
    );
  });

  it("исполнителю говорит, что файлы не приложил клиент", () => {
    expect(emptyClientFilesMessage({ isOwner: false, isParty: true })).toBe(
      "Клиент не приложил файлы к этому заказу.",
    );
  });
});
