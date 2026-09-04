import { describe, expect, it } from "vitest";

import {
  FileOwnerType,
  ObjectType,
  OrderCategory,
  OrderStatus,
  type OrderDetail,
  type OrderFileDto,
  type OrderSubmissionDto,
} from "@/lib/types";

import { resolveSubmissions } from "./submissions";

function file(
  round: number,
  name: string,
  ownerType: FileOwnerType = FileOwnerType.COMPANY,
): OrderFileDto {
  return {
    id: `${ownerType}-${round}-${name}`,
    orderId: "order-1",
    ownerType,
    submissionRound: round,
    originalName: name,
    mimeType: "application/pdf",
    sizeBytes: 1024,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

function submission(round: number, submittedAt: string | null): OrderSubmissionDto {
  return {
    round,
    comment: `Сдача ${round}`,
    submittedAt,
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
    clientBudget: null,
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
    client: null,
    offers: [],
    files: [],
    submissions: [],
    ...patch,
  };
}

describe("resolveSubmissions", () => {
  it("заказ без сдач не даёт ни последней, ни истории", () => {
    expect(resolveSubmissions(order())).toEqual({
      latest: null,
      history: [],
      open: null,
    });
  });

  it("файлы клиента сдачей не считаются", () => {
    const view = resolveSubmissions(
      order({ files: [file(0, "план.pdf", FileOwnerType.CLIENT)] }),
    );

    expect(view.latest).toBeNull();
  });

  it("раскладывает файлы по своим раундам", () => {
    const view = resolveSubmissions(
      order({
        submissions: [
          submission(1, "2026-09-02T00:00:00.000Z"),
          submission(2, "2026-09-05T00:00:00.000Z"),
        ],
        files: [
          file(1, "первый.pdf"),
          file(2, "второй.pdf"),
          file(2, "третий.pdf"),
          file(0, "задание.pdf", FileOwnerType.CLIENT),
        ],
      }),
    );

    expect(view.latest?.round).toBe(2);
    expect(view.latest?.files.map((item) => item.originalName)).toEqual([
      "второй.pdf",
      "третий.pdf",
    ]);
    expect(view.history.map((item) => item.round)).toEqual([1]);
    expect(view.history[0]?.files.map((item) => item.originalName)).toEqual([
      "первый.pdf",
    ]);
  });

  it("история идёт от свежей сдачи к старой", () => {
    const view = resolveSubmissions(
      order({
        submissions: [
          submission(1, "2026-09-02T00:00:00.000Z"),
          submission(2, "2026-09-05T00:00:00.000Z"),
          submission(3, "2026-09-08T00:00:00.000Z"),
        ],
      }),
    );

    expect(view.latest?.round).toBe(3);
    expect(view.history.map((item) => item.round)).toEqual([2, 1]);
  });

  it("несданная сдача считается открытой", () => {
    const view = resolveSubmissions(
      order({
        submissions: [submission(1, "2026-09-02T00:00:00.000Z"), submission(2, null)],
        files: [file(2, "черновик.pdf")],
      }),
    );

    expect(view.open?.round).toBe(2);
    expect(view.open?.files).toHaveLength(1);
  });

  it("после сдачи открытых сдач не остаётся", () => {
    const view = resolveSubmissions(
      order({ submissions: [submission(1, "2026-09-02T00:00:00.000Z")] }),
    );

    expect(view.open).toBeNull();
    expect(view.latest?.round).toBe(1);
  });

  it("файлы без строки сдачи не теряются", () => {
    // Загрузка в хранилище идёт после коммита транзакции, и промежуточное
    // состояние «файлы есть, строки сдачи нет» существует. Молча спрятать
    // такие файлы страница не вправе.
    const view = resolveSubmissions(order({ files: [file(1, "ничей.pdf")] }));

    expect(view.latest?.round).toBe(1);
    expect(view.latest?.comment).toBe("");
    expect(view.latest?.files).toHaveLength(1);
  });
});
