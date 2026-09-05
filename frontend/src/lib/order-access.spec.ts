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
    canSubmitOffer: false,
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

  /**
   * Настоящий статус backend отдаёт владельцу и компании с активным
   * предложением; остальным заказ приходит как «Поиск исполнителя», чем бы он
   * ни был (ТЗ §4.1). Показывать этот подставной статус нельзя — рядом стоит
   * статус собственного предложения компании.
   */
  describe("настоящий статус заказа", () => {
    it("виден владельцу", () => {
      expect(resolveOrderDetailAccess(order(), CLIENT_ID).seesRealStatus).toBe(true);
    });

    it.each([
      OfferStatus.SENT,
      OfferStatus.ACCEPTED,
      OfferStatus.WORK_SUBMITTED,
      OfferStatus.BACK_FOR_OVERRIDE,
      OfferStatus.COMPLETED,
    ])("виден компании с предложением в статусе %s", (status) => {
      const access = resolveOrderDetailAccess(
        order({ client: null, offers: [offer(OTHER_COMPANY_ID, status)] }),
        OTHER_COMPANY_ID,
      );

      expect(access.seesRealStatus).toBe(true);
    });

    it.each([OfferStatus.NOT_ACCEPTED, OfferStatus.REJECTED, OfferStatus.WITHDRAWN])(
      "скрыт от компании с предложением в статусе %s",
      (status) => {
        const access = resolveOrderDetailAccess(
          order({ client: null, offers: [offer(OTHER_COMPANY_ID, status)] }),
          OTHER_COMPANY_ID,
        );

        expect(access.seesRealStatus).toBe(false);
      },
    );

    it("скрыт от компании без предложения", () => {
      const access = resolveOrderDetailAccess(order({ client: null }), OTHER_COMPANY_ID);

      expect(access.seesRealStatus).toBe(false);
    });
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
  it("владельцу говорит, что файлы не приложил он сам", () => {
    expect(emptyClientFilesMessage({ isOwner: true })).toBe(
      "Вы не приложили файлы к этому заказу.",
    );
  });

  it("компании говорит, что файлы не приложил клиент", () => {
    // Отличить «клиент ничего не приложил» от «заказ уже занят» компания
    // не может: настоящий статус от неё скрыт (ТЗ §4.1), и подсказка про
    // скрытые файлы выдавала бы его.
    expect(emptyClientFilesMessage({ isOwner: false })).toBe(
      "Клиент не приложил файлы к этому заказу.",
    );
  });
});
