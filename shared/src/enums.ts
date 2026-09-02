/**
 * Перечисления доменной модели (ТЗ §3).
 *
 * Заданы как `const`-объекты, а не через `enum`: такой вид переживает
 * стирание типов при сборке и одинаково работает и в NestJS, и в Next.js.
 * Значения обязаны совпадать с enum-ами в Prisma-схеме.
 */

/** Роль пользователя. */
export const Role = {
  CLIENT: 'CLIENT',
  COMPANY: 'COMPANY',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/** Что именно заказывают. */
export const OrderCategory = {
  PLAN_CREATION: 'PLAN_CREATION',
  PLAN_IMPLEMENTATION: 'PLAN_IMPLEMENTATION',
} as const;
export type OrderCategory = (typeof OrderCategory)[keyof typeof OrderCategory];

/** Что строят или ремонтируют. */
export const ObjectType = {
  APARTMENT: 'APARTMENT',
  HOUSE: 'HOUSE',
  COMMERCIAL: 'COMMERCIAL',
  GOVERNMENT: 'GOVERNMENT',
} as const;
export type ObjectType = (typeof ObjectType)[keyof typeof ObjectType];

/** Статус заказа — состояние state-машины (ТЗ §4). */
export const OrderStatus = {
  WAITING: 'WAITING',
  AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
  IN_PROGRESS: 'IN_PROGRESS',
  AWAITING_COMPLETION_CONFIRMATION: 'AWAITING_COMPLETION_CONFIRMATION',
  COMPLETED: 'COMPLETED',
  COMPLETION_DISPUTED: 'COMPLETION_DISPUTED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

/** Статус предложения компании. */
export const OfferStatus = {
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  NOT_ACCEPTED: 'NOT_ACCEPTED',
  WITHDRAWN: 'WITHDRAWN',
  WORK_SUBMITTED: 'WORK_SUBMITTED',
  COMPLETED: 'COMPLETED',
  BACK_FOR_OVERRIDE: 'BACK_FOR_OVERRIDE',
} as const;
export type OfferStatus = (typeof OfferStatus)[keyof typeof OfferStatus];

/** Кто загрузил файл. */
export const FileOwnerType = {
  CLIENT: 'CLIENT',
  COMPANY: 'COMPANY',
} as const;
export type FileOwnerType = (typeof FileOwnerType)[keyof typeof FileOwnerType];

/**
 * Тип уведомления.
 * Создание заказа сюда не входит: оно уходит broadcast'ом в `company-feed`
 * и записей в БД не порождает (ТЗ §3, §8).
 */
export const NotificationType = {
  OFFER_RECEIVED: 'OFFER_RECEIVED',
  OFFER_ACCEPTED: 'OFFER_ACCEPTED',
  OFFER_REJECTED: 'OFFER_REJECTED',
  WORK_SUBMITTED: 'WORK_SUBMITTED',
  WORK_CONFIRMED: 'WORK_CONFIRMED',
  WORK_DISPUTED: 'WORK_DISPUTED',
  FILES_UPDATED: 'FILES_UPDATED',
  AREA_VERIFIED: 'AREA_VERIFIED',
} as const;
export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];
