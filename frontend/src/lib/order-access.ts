/**
 * Кто смотрит заказ и что ему показывать (ТЗ §4.1, «Приватность и видимость»).
 *
 * Состав данных урезает backend, а не страница. Но одинаково пустой список
 * приходит и когда файлов нет, и когда их не показали, — разницу страница
 * обязана объяснить сама, и решается это здесь.
 *
 * Модуль чистый: ни React, ни fetch.
 */

import { FileOwnerType, isExecutorOffer, type OrderDetail, type OrderFileDto } from "@/lib/types";

export interface OrderDetailAccess {
  /** Смотрит клиент, создавший заказ. */
  isOwner: boolean;
  /** Смотрит сторона сделки: клиент заказа либо компания-исполнитель. */
  isParty: boolean;
  /** Файлы задания — то, что приложил клиент. Сдачи компании идут отдельно. */
  clientFiles: OrderFileDto[];
}

export function resolveOrderDetailAccess(
  order: OrderDetail,
  /** Кто смотрит. `null` — сессия пропала между рендером и запросом. */
  viewerId: string | null,
): OrderDetailAccess {
  // `client` приходит только сторонам сделки, поэтому его отсутствие само
  // по себе означает «смотрит не владелец».
  const isOwner = viewerId !== null && order.client?.id === viewerId;

  const isParty =
    isOwner ||
    order.offers.some(
      (offer) => offer.companyId === viewerId && isExecutorOffer(offer.status),
    );

  return {
    isOwner,
    isParty,
    clientFiles: order.files.filter((file) => file.ownerType === FileOwnerType.CLIENT),
  };
}

/**
 * Почему список файлов задания пуст.
 *
 * Посторонней компании файлы не отдаются вовсе, и написать ей «файлов нет»
 * было бы неправдой: они могут быть, просто не для неё.
 */
export function emptyClientFilesMessage({
  isOwner,
  isParty,
}: Pick<OrderDetailAccess, "isOwner" | "isParty">): string {
  if (!isParty) return "Файлы задания видны компании, чьё предложение принято.";

  return isOwner
    ? "Вы не приложили файлы к этому заказу."
    : "Клиент не приложил файлы к этому заказу.";
}
