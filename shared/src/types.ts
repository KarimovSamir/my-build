/**
 * Формы данных, которыми обмениваются backend и frontend.
 *
 * Это контракт API, а не отражение таблиц: суммы приходят строками
 * (Decimal не переживает JSON без потерь), даты — строками ISO-8601.
 */

import type {
  FileOwnerType,
  NotificationType,
  ObjectType,
  OfferStatus,
  OrderCategory,
  OrderStatus,
  Role,
} from './enums.js';

/** Дата в формате ISO-8601, как она приходит по сети. */
export type IsoDateString = string;

/** Денежная сумма строкой — чтобы не терять точность на числах с плавающей точкой. */
export type MoneyString = string;

/** Профиль пользователя (ТЗ §3). */
export interface UserProfile {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string | null;
  phone: string;
  companyName: string | null;
  city: string | null;
  country: string | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

/** Карточка компании в разделе «Подрядчики». */
export interface ContractorCard {
  id: string;
  companyName: string;
  city: string | null;
  country: string | null;
  email: string;
  phone: string;
  completedOrdersCount: number;
}

/** Файл, приложенный к заказу. */
export interface OrderFileDto {
  id: string;
  orderId: string;
  ownerType: FileOwnerType;
  submissionRound: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: IsoDateString;
}

/** Предложение компании по заказу. */
export interface OfferDto {
  id: string;
  orderId: string;
  companyId: string;
  companyName: string;
  status: OfferStatus;
  proposedPrice: MoneyString;
  proposedDeadline: IsoDateString;
  comment: string | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

/** Строка в списке заказов. */
export interface OrderListItem {
  id: string;
  orderNumber: number;
  title: string;
  status: OrderStatus;
  category: OrderCategory;
  objectType: ObjectType;
  clientBudget: MoneyString | null;
  price: MoneyString | null;
  deadline: IsoDateString | null;
  contractorName: string | null;
  createdAt: IsoDateString;
}

/**
 * Полная карточка заказа.
 * Состав полей зависит от роли смотрящего (ТЗ §4.1, «Приватность и видимость»):
 * компания видит только своё предложение, клиент — все активные.
 */
export interface OrderDetail extends OrderListItem {
  description: string;
  address: string;
  squareMeters: number;
  verifiedSquareMeters: number | null;
  desiredStartDate: IsoDateString | null;
  clientCompletionComment: string | null;
  correctionComment: string | null;
  updatedAt: IsoDateString;
  client: Pick<UserProfile, 'id' | 'firstName' | 'lastName' | 'city' | 'country'>;
  offers: OfferDto[];
  files: OrderFileDto[];
}

/** Уведомление в колокольчике и в разделе «Уведомления». */
export interface NotificationDto {
  id: string;
  type: NotificationType;
  orderId: string | null;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: IsoDateString;
}
