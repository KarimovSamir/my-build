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

import { resolveOrderDetailAccess } from "./order-access";
import { resolveClientActions, resolveCompanyActions } from "./order-actions";
import { resolveSubmissions } from "./submissions";

const CLIENT_ID = "6f1c7a0e-0000-4000-8000-000000000001";
const COMPANY_A = "6f1c7a0e-0000-4000-8000-000000000002";
const COMPANY_B = "6f1c7a0e-0000-4000-8000-000000000003";

function offer(companyId: string, status: OfferStatus): OfferDto {
  return {
    id: `offer-${companyId}`,
    orderId: "order-1",
    companyId,
    companyName: `Компания ${companyId.slice(-1)}`,
    status,
    proposedPrice: "150000",
    proposedDeadline: "2026-10-01T00:00:00.000Z",
    comment: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function order(patch: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: "order-1",
    orderNumber: 7829,
    title: "Ремонт кухни",
    status: OrderStatus.AWAITING_CONFIRMATION,
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
    client: {
      id: CLIENT_ID,
      firstName: "Иван",
      lastName: "Петров",
      city: null,
      country: null,
    },
    offers: [],
    files: [],
    submissions: [],
    ...patch,
  };
}

/** Действия глазами конкретного пользователя — как их считает страница. */
function actionsFor(detail: OrderDetail, viewerId: string | null) {
  return resolveClientActions(detail, resolveOrderDetailAccess(detail, viewerId));
}

describe("resolveClientActions — выбор предложения", () => {
  it("даёт принять и отклонить каждое предложение, ждущее выбора", () => {
    const actions = actionsFor(
      order({
        offers: [offer(COMPANY_A, OfferStatus.SENT), offer(COMPANY_B, OfferStatus.SENT)],
      }),
      CLIENT_ID,
    );

    expect(actions.decisions).toHaveLength(2);
    expect(actions.decisions.every((cell) => cell.canAccept && cell.canReject)).toBe(true);
    expect(actions.executorOffer).toBeNull();
  });

  it("в статусе поиска исполнителя решать нечего", () => {
    // Предложений в `WAITING` быть не может, но статус проверяется отдельно
    // от их наличия — иначе кнопка появилась бы на рассинхроне данных.
    const actions = actionsFor(
      order({ status: OrderStatus.WAITING, offers: [offer(COMPANY_A, OfferStatus.SENT)] }),
      CLIENT_ID,
    );

    expect(actions.decisions[0]?.canAccept).toBe(false);
    expect(actions.decisions[0]?.canReject).toBe(false);
  });

  it("после принятия остаётся исполнитель и ни одного решения", () => {
    const actions = actionsFor(
      order({
        status: OrderStatus.IN_PROGRESS,
        offers: [offer(COMPANY_A, OfferStatus.ACCEPTED)],
      }),
      CLIENT_ID,
    );

    expect(actions.decisions).toHaveLength(0);
    expect(actions.executorOffer?.companyId).toBe(COMPANY_A);
  });

  it("компании не даёт решений по её собственному предложению", () => {
    // Своё предложение в `SENT` компания видит в том же поле `offers`, и без
    // проверки владения получила бы кнопку «Принять» на саму себя.
    const actions = actionsFor(
      order({ client: null, offers: [offer(COMPANY_A, OfferStatus.SENT)] }),
      COMPANY_A,
    );

    expect(actions.decisions).toHaveLength(0);
    expect(actions.executorOffer).toBeNull();
  });

  it("пропавшая сессия действий не даёт", () => {
    const actions = actionsFor(order({ offers: [offer(COMPANY_A, OfferStatus.SENT)] }), null);

    expect(actions.decisions).toHaveLength(0);
  });
});

describe("resolveClientActions — приёмка работы", () => {
  it("даёт подтвердить и вернуть на доработку, когда работа сдана", () => {
    const actions = actionsFor(
      order({
        status: OrderStatus.AWAITING_COMPLETION_CONFIRMATION,
        offers: [offer(COMPANY_A, OfferStatus.WORK_SUBMITTED)],
      }),
      CLIENT_ID,
    );

    expect(actions.canConfirmWork).toBe(true);
    expect(actions.canDisputeWork).toBe(true);
  });

  it("пока работа не сдана, решать нечего", () => {
    for (const status of [OrderStatus.IN_PROGRESS, OrderStatus.COMPLETION_DISPUTED]) {
      const actions = actionsFor(
        order({
          status,
          offers: [
            offer(
              COMPANY_A,
              status === OrderStatus.IN_PROGRESS
                ? OfferStatus.ACCEPTED
                : OfferStatus.BACK_FOR_OVERRIDE,
            ),
          ],
        }),
        CLIENT_ID,
      );

      expect(actions.canConfirmWork, status).toBe(false);
      expect(actions.canDisputeWork, status).toBe(false);
    }
  });

  it("завершённый заказ принять второй раз нельзя", () => {
    const actions = actionsFor(
      order({
        status: OrderStatus.COMPLETED,
        offers: [offer(COMPANY_A, OfferStatus.COMPLETED)],
      }),
      CLIENT_ID,
    );

    expect(actions.canConfirmWork).toBe(false);
    expect(actions.canDisputeWork).toBe(false);
    expect(actions.executorOffer?.status).toBe(OfferStatus.COMPLETED);
  });

  it("исполнителю кнопок приёмки не даёт", () => {
    const actions = actionsFor(
      order({
        status: OrderStatus.AWAITING_COMPLETION_CONFIRMATION,
        offers: [offer(COMPANY_A, OfferStatus.WORK_SUBMITTED)],
      }),
      COMPANY_A,
    );

    expect(actions.canConfirmWork).toBe(false);
    expect(actions.canDisputeWork).toBe(false);
  });

  it("без предложения исполнителя решений нет", () => {
    // Статус сам по себе разрешил бы переход: без предложения проверять
    // предусловие нечем, и `canTransition` ответил бы «да».
    const actions = actionsFor(
      order({ status: OrderStatus.AWAITING_COMPLETION_CONFIRMATION }),
      CLIENT_ID,
    );

    expect(actions.canConfirmWork).toBe(false);
    expect(actions.canDisputeWork).toBe(false);
  });
});

/** Действия компании — как их считает страница заказа. */
function companyActionsFor(detail: OrderDetail, viewerId: string | null) {
  const access = resolveOrderDetailAccess(detail, viewerId);

  return resolveCompanyActions(detail, access, resolveSubmissions(detail), viewerId);
}

function companyFile(round: number): OrderFileDto {
  return {
    id: `file-${round}`,
    orderId: "order-1",
    ownerType: FileOwnerType.COMPANY,
    submissionRound: round,
    originalName: "план.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

/** Открытая сдача с файлом: то, из чего складывается готовность сдавать. */
function readyToSubmit(status: OrderStatus, offerStatus: OfferStatus): OrderDetail {
  return order({
    status,
    offers: [offer(COMPANY_A, offerStatus)],
    files: [companyFile(1)],
    submissions: [
      { round: 1, comment: "Готово", submittedAt: null, createdAt: "2026-09-02T00:00:00.000Z" },
    ],
  });
}

describe("resolveCompanyActions", () => {
  it("клиенту не даёт ничего, даже на своём заказе", () => {
    const actions = companyActionsFor(
      readyToSubmit(OrderStatus.IN_PROGRESS, OfferStatus.ACCEPTED),
      CLIENT_ID,
    );

    expect(actions).toEqual({
      ownOffer: null,
      isExecutor: false,
      canAddFiles: false,
      canSubmitWork: false,
      canVerifyArea: false,
    });
  });

  it("компании с предложением на выбор показывает его, но работать не даёт", () => {
    const actions = companyActionsFor(
      order({ offers: [offer(COMPANY_A, OfferStatus.SENT)] }),
      COMPANY_A,
    );

    expect(actions.ownOffer?.status).toBe(OfferStatus.SENT);
    expect(actions.isExecutor).toBe(false);
    expect(actions.canAddFiles).toBe(false);
    expect(actions.canVerifyArea).toBe(false);
  });

  it("исполнителю в работе даёт файлы и площадь", () => {
    const actions = companyActionsFor(
      order({ status: OrderStatus.IN_PROGRESS, offers: [offer(COMPANY_A, OfferStatus.ACCEPTED)] }),
      COMPANY_A,
    );

    expect(actions.isExecutor).toBe(true);
    expect(actions.canAddFiles).toBe(true);
    expect(actions.canVerifyArea).toBe(true);
    // Загруженных файлов нет — сдавать нечего, и сервер ответил бы 409.
    expect(actions.canSubmitWork).toBe(false);
  });

  it("сдать работу даёт, только когда в открытой сдаче есть файл", () => {
    const actions = companyActionsFor(
      readyToSubmit(OrderStatus.IN_PROGRESS, OfferStatus.ACCEPTED),
      COMPANY_A,
    );

    expect(actions.canSubmitWork).toBe(true);
  });

  it("после доработки снова даёт загрузить файлы и пересдать", () => {
    const actions = companyActionsFor(
      readyToSubmit(OrderStatus.COMPLETION_DISPUTED, OfferStatus.BACK_FOR_OVERRIDE),
      COMPANY_A,
    );

    expect(actions.canAddFiles).toBe(true);
    expect(actions.canSubmitWork).toBe(true);
  });

  it("пока работа у клиента, файлы не добавляются, а площадь уточняется", () => {
    const actions = companyActionsFor(
      order({
        status: OrderStatus.AWAITING_COMPLETION_CONFIRMATION,
        offers: [offer(COMPANY_A, OfferStatus.WORK_SUBMITTED)],
        files: [companyFile(1)],
        submissions: [
          {
            round: 1,
            comment: "Готово",
            submittedAt: "2026-09-03T00:00:00.000Z",
            createdAt: "2026-09-02T00:00:00.000Z",
          },
        ],
      }),
      COMPANY_A,
    );

    expect(actions.canAddFiles).toBe(false);
    expect(actions.canSubmitWork).toBe(false);
    expect(actions.canVerifyArea).toBe(true);
  });

  it("на завершённом заказе не остаётся ни одного действия", () => {
    const actions = companyActionsFor(
      order({
        status: OrderStatus.COMPLETED,
        offers: [offer(COMPANY_A, OfferStatus.COMPLETED)],
      }),
      COMPANY_A,
    );

    expect(actions.isExecutor).toBe(true);
    expect(actions.canAddFiles).toBe(false);
    expect(actions.canSubmitWork).toBe(false);
    expect(actions.canVerifyArea).toBe(false);
  });

  it("без сессии действий нет", () => {
    const actions = companyActionsFor(
      readyToSubmit(OrderStatus.IN_PROGRESS, OfferStatus.ACCEPTED),
      null,
    );

    expect(actions.ownOffer).toBeNull();
    expect(actions.isExecutor).toBe(false);
  });
});
