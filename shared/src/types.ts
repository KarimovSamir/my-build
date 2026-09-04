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

/**
 * Ссылка на скачивание файла (ТЗ §5, `GET /documents/:id/download`).
 *
 * Подпись живёт недолго и выдаётся под конкретного пользователя, поэтому
 * ссылку запрашивают в момент нажатия, а не кладут в разметку страницы.
 */
export interface DownloadLink {
  url: string;
  originalName: string;
}

/**
 * Сдача работы компанией (ТЗ §4.1).
 *
 * Файлы сюда не вкладываются: они уже приходят в `OrderDetail.files`
 * и относятся к сдаче полем `submissionRound`. Дублировать их вторым списком
 * значило бы возить одно и то же дважды и получить два источника правды.
 */
export interface OrderSubmissionDto {
  /** Номер сдачи, начиная с 1. Совпадает с `submissionRound` её файлов. */
  round: number;
  /** Комментарий компании — при добавлении файлов он обязателен (ТЗ §4.1). */
  comment: string;
  /** Когда работа ушла клиенту. `null` — сдача ещё готовится. */
  submittedAt: IsoDateString | null;
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
  /**
   * Заказчик. Виден только сторонам сделки — владельцу и компании-исполнителю;
   * для остальных `null` (ТЗ §4.1, приватность). Адрес объекта при этом виден
   * всем: по нему компания и решает, браться ли за заказ.
   */
  client: Pick<UserProfile, 'id' | 'firstName' | 'lastName' | 'city' | 'country'> | null;
  offers: OfferDto[];
  files: OrderFileDto[];
  /**
   * Сдачи работы, от первой к последней. Как и файлы, видны только сторонам
   * сделки; для остальных список пуст (ТЗ §4.1).
   */
  submissions: OrderSubmissionDto[];
}

/**
 * Строка в списке «Мои предложения» компании (`GET /company/offers`).
 *
 * Заказ вложен целиком в том же виде, в каком он приходит в списке: правила
 * видимости для компании одни и те же, и считает их одна и та же функция.
 * Значит, у заказа с уже отклонённым предложением статус будет показан как
 * `WAITING` — компания в нём больше не участвует (ТЗ §4.1).
 */
export interface CompanyOfferItem extends OfferDto {
  order: OrderListItem;
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
