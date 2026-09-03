/**
 * Заказ в том виде, в каком его видит конкретный пользователь (ТЗ §4.1).
 *
 * Здесь нет ни базы, ни Nest — чистые функции над уже прочитанными строками.
 * Приватность важнее всего остального в этом модуле, поэтому она вынесена
 * туда, где её можно проверить unit-тестами целиком и без сети.
 */

import {
  OrderStatus,
  type IsoDateString,
  type MoneyString,
  type ObjectType,
  type OfferDto,
  type OfferStatus,
  type OrderCategory,
  type OrderDetail,
  type OrderFileDto,
  type OrderListItem,
} from '@mybuild/shared';

import type { Prisma } from '../../generated/prisma/client.js';
import { isActiveOffer, isExecutorOffer } from './order-participation.js';

/**
 * Кто смотрит на заказ.
 *
 * Только идентификатор: видимость определяется связью с заказом, а не ролью
 * из токена. Токен живёт час и может устареть, связь — нет.
 */
export interface OrderViewer {
  id: string;
}

/** Предложение в том объёме, который нужен для показа заказа. */
export interface OfferRow {
  id: string;
  orderId: string;
  companyId: string;
  status: OfferStatus;
  proposedPrice: Prisma.Decimal;
  proposedDeadline: Date;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
  company: { companyName: string | null };
}

/**
 * Заказ со связями, достаточными для строки списка.
 *
 * `offers` обязан содержать предложение исполнителя (если оно есть) и
 * предложение самого смотрящего (если он компания). Запрос сужает выборку
 * до этих двух — тянуть чужие предложения ради одной колонки незачем.
 */
export interface OrderRow {
  id: string;
  orderNumber: number;
  clientId: string;
  title: string;
  status: OrderStatus;
  category: OrderCategory;
  objectType: ObjectType;
  clientBudget: Prisma.Decimal | null;
  price: Prisma.Decimal | null;
  deadline: Date | null;
  createdAt: Date;
  offers: OfferRow[];
}

/** Заказ со всем, что нужно для карточки. */
export interface OrderDetailRow extends OrderRow {
  description: string;
  address: string;
  squareMeters: number;
  verifiedSquareMeters: number | null;
  desiredStartDate: Date | null;
  clientCompletionComment: string | null;
  correctionComment: string | null;
  updatedAt: Date;
  client: {
    id: string;
    firstName: string;
    lastName: string | null;
    city: string | null;
    country: string | null;
  };
  files: OrderFileDto[];
}

/** Что именно этому пользователю позволено видеть в этом заказе. */
export interface OrderVisibility {
  /** Клиент — владелец заказа. */
  isOwner: boolean;
  /** Предложение смотрящего по этому заказу, если он компания и оно есть. */
  ownOffer: OfferRow | null;
  /** Предложение, по которому заказ исполняется. */
  executorOffer: OfferRow | null;
  /**
   * Смотрящий видит настоящий статус заказа: он владелец либо компания
   * с активным предложением. Для остальных заказ выглядит как `WAITING`.
   */
  seesProgress: boolean;
  /** Смотрящий — сторона сделки: владелец либо компания-исполнитель. */
  isParty: boolean;
}

export function resolveVisibility(order: OrderRow, viewer: OrderViewer): OrderVisibility {
  const isOwner = order.clientId === viewer.id;

  const ownOffer = order.offers.find((offer) => offer.companyId === viewer.id) ?? null;
  const executorOffer =
    order.offers.find((offer) => isExecutorOffer(offer.status)) ?? null;

  const isExecutor = ownOffer !== null && isExecutorOffer(ownOffer.status);

  return {
    isOwner,
    ownOffer,
    executorOffer,
    seesProgress: isOwner || (ownOffer !== null && isActiveOffer(ownOffer.status)),
    isParty: isOwner || isExecutor,
  };
}

/** Строка списка заказов (ТЗ §7, таблица «Все заказы»). */
export function toOrderListItem(order: OrderRow, viewer: OrderViewer): OrderListItem {
  const view = resolveVisibility(order, viewer);

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    title: order.title,
    // Компания, не участвующая в заказе, не видит его прогресса (ТЗ §4.1).
    status: view.seesProgress ? order.status : OrderStatus.WAITING,
    category: order.category,
    objectType: order.objectType,
    clientBudget: toMoney(order.clientBudget),
    price: view.seesProgress ? toMoney(order.price) : null,
    deadline: view.seesProgress ? toIso(order.deadline) : null,
    contractorName: view.isParty
      ? (view.executorOffer?.company.companyName ?? null)
      : null,
    createdAt: order.createdAt.toISOString(),
  };
}

/** Карточка заказа целиком, с оглядкой на то, кто её открыл. */
export function toOrderDetail(
  order: OrderDetailRow,
  viewer: OrderViewer,
): OrderDetail {
  const view = resolveVisibility(order, viewer);

  return {
    ...toOrderListItem(order, viewer),
    description: order.description,
    address: order.address,
    squareMeters: order.squareMeters,
    verifiedSquareMeters: view.seesProgress ? order.verifiedSquareMeters : null,
    desiredStartDate: toIso(order.desiredStartDate),
    // Комментарии приёмки и доработки — только сторонам сделки (ТЗ §4.1).
    clientCompletionComment: view.isParty ? order.clientCompletionComment : null,
    correctionComment: view.isParty ? order.correctionComment : null,
    updatedAt: order.updatedAt.toISOString(),
    client: order.client,
    offers: visibleOffers(order, view),
    // Доступ к файлам совпадает с проверкой в FilesService: задание клиента
    // и сдачи компании видят только стороны сделки.
    files: view.isParty ? order.files : [],
  };
}

/**
 * Какие предложения показать.
 *
 * Клиенту — все, что ещё в игре: отозванные, отклонённые и невыбранные ему
 * уже ни на что не влияют. Компании — только её собственное, чужих цен она
 * не видит никогда (ТЗ §4.1).
 */
function visibleOffers(order: OrderRow, view: OrderVisibility): OfferDto[] {
  if (view.isOwner) {
    return order.offers.filter((offer) => isActiveOffer(offer.status)).map(toOfferDto);
  }

  return view.ownOffer ? [toOfferDto(view.ownOffer)] : [];
}

export function toOfferDto(offer: OfferRow): OfferDto {
  return {
    id: offer.id,
    orderId: offer.orderId,
    companyId: offer.companyId,
    companyName: offer.company.companyName ?? '',
    status: offer.status,
    proposedPrice: offer.proposedPrice.toString(),
    proposedDeadline: offer.proposedDeadline.toISOString(),
    comment: offer.comment,
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
  };
}

/** Decimal не переживает JSON без потерь, поэтому суммы уходят строками. */
function toMoney(value: Prisma.Decimal | null): MoneyString | null {
  return value === null ? null : value.toString();
}

function toIso(value: Date | null): IsoDateString | null {
  return value === null ? null : value.toISOString();
}
