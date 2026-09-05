/**
 * Человекочитаемые названия для интерфейса (ТЗ §3).
 *
 * Интерфейс на русском, код на английском — весь перевод собран здесь,
 * чтобы одинаковые статусы не расходились между экранами клиента и компании.
 */

import {
  NotificationType,
  ObjectType,
  OfferStatus,
  OrderCategory,
  OrderStatus,
  Role,
} from './enums.js';
import { OrderEventType } from './state.js';

export const roleLabels: Record<Role, string> = {
  CLIENT: 'Клиент',
  COMPANY: 'Компания',
};

export const orderCategoryLabels: Record<OrderCategory, string> = {
  PLAN_CREATION: 'Создание плана проекта',
  PLAN_IMPLEMENTATION: 'Реализация плана',
};

export const objectTypeLabels: Record<ObjectType, string> = {
  APARTMENT: 'Квартира',
  HOUSE: 'Частный дом',
  COMMERCIAL: 'Коммерческое помещение',
  GOVERNMENT: 'Гос. объект',
};

export const orderStatusLabels: Record<OrderStatus, string> = {
  WAITING: 'Поиск исполнителя',
  AWAITING_CONFIRMATION: 'Ожидает подтверждения',
  IN_PROGRESS: 'В работе',
  AWAITING_COMPLETION_CONFIRMATION: 'Ожидание подтверждения выполнения',
  COMPLETED: 'Завершён',
  COMPLETION_DISPUTED: 'На доработке',
};

/** Цвет badge статуса заказа. Один и тот же на всех экранах (ТЗ §3, §7). */
export type StatusTone = 'gray' | 'yellow' | 'blue' | 'green' | 'red';

export const orderStatusTones: Record<OrderStatus, StatusTone> = {
  WAITING: 'gray',
  AWAITING_CONFIRMATION: 'yellow',
  IN_PROGRESS: 'blue',
  AWAITING_COMPLETION_CONFIRMATION: 'yellow',
  COMPLETED: 'green',
  COMPLETION_DISPUTED: 'red',
};

export const offerStatusLabels: Record<OfferStatus, string> = {
  SENT: 'Предложение отправлено',
  ACCEPTED: 'Предложение принято',
  REJECTED: 'Предложение отклонено',
  NOT_ACCEPTED: 'Не выбрано',
  WITHDRAWN: 'Предложение отозвано',
  WORK_SUBMITTED: 'Работа сдана, ждёт подтверждения',
  COMPLETED: 'Предложение завершено',
  BACK_FOR_OVERRIDE: 'Возвращено на доработку',
};

export const offerStatusTones: Record<OfferStatus, StatusTone> = {
  SENT: 'blue',
  ACCEPTED: 'green',
  REJECTED: 'red',
  NOT_ACCEPTED: 'gray',
  WITHDRAWN: 'gray',
  WORK_SUBMITTED: 'yellow',
  COMPLETED: 'green',
  BACK_FOR_OVERRIDE: 'red',
};

/**
 * Названия действий над заказом (ТЗ §4).
 *
 * Нужны там, где о событии говорят пользователю: сообщение об ошибке 409
 * пишется в интерфейсе как есть, и `OFFER_SUBMITTED` в нём — такой же
 * машинный код посреди русского текста, как непереведённый статус.
 */
export const orderEventLabels: Record<OrderEventType, string> = {
  OFFER_SUBMITTED: 'Отправка предложения',
  OFFER_WITHDRAWN: 'Отзыв предложения',
  OFFER_REJECTED: 'Отклонение предложения',
  OFFER_ACCEPTED: 'Принятие предложения',
  WORK_SUBMITTED: 'Сдача работы',
  WORK_CONFIRMED: 'Подтверждение выполнения',
  WORK_DISPUTED: 'Отправка на доработку',
};

export const notificationTypeLabels: Record<NotificationType, string> = {
  OFFER_RECEIVED: 'Новое предложение',
  OFFER_ACCEPTED: 'Предложение принято',
  OFFER_REJECTED: 'Предложение отклонено',
  OFFER_NOT_ACCEPTED: 'Предложение не выбрано',
  OFFER_WITHDRAWN: 'Предложение отозвано',
  WORK_SUBMITTED: 'Работа сдана',
  WORK_CONFIRMED: 'Работа принята',
  WORK_DISPUTED: 'Работа отправлена на доработку',
  FILES_UPDATED: 'Обновлены файлы заказа',
  AREA_VERIFIED: 'Уточнена площадь',
};

/** Номер заказа в том виде, в каком его видит пользователь: `ORD-7829`. */
export function formatOrderNumber(orderNumber: number): string {
  return `ORD-${orderNumber}`;
}

/**
 * Наибольший возможный номер заказа.
 *
 * `Order.orderNumber` — колонка типа `Int` (32-разрядное целое со знаком),
 * и число больше этого в неё не помещается. Граница нужна не для красоты:
 * без неё поиск по длинной строке цифр доходил бы до базы и падал там
 * с «value out of range for type integer», то есть на 500.
 */
export const MAX_ORDER_NUMBER = 2_147_483_647;

/**
 * Разбор поискового запроса по номеру заказа.
 * Принимает и `ORD-7829`, и `7829` (ТЗ §4.1). Возвращает null, если это
 * не номер или если такого номера не может существовать.
 */
export function parseOrderNumber(query: string): number | null {
  const match = /^\s*(?:ORD-)?(\d+)\s*$/i.exec(query);
  if (!match?.[1]) return null;

  const parsed = Number.parseInt(match[1], 10);

  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_ORDER_NUMBER) {
    return null;
  }

  return parsed;
}
