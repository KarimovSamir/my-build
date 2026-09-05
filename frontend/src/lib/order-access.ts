/**
 * Кто смотрит заказ и что ему показывать (ТЗ §4.1, «Приватность и видимость»).
 *
 * Состав данных урезает backend, а не страница. Но одинаково пустой список
 * приходит и когда файлов нет, и когда их не показали, — разницу страница
 * обязана объяснить сама, и решается это здесь.
 *
 * Модуль чистый: ни React, ни fetch.
 */

import {
  FileOwnerType,
  isActiveOffer,
  isExecutorOffer,
  type OrderDetail,
  type OrderFileDto,
} from "@/lib/types";

export interface OrderDetailAccess {
  /** Смотрит клиент, создавший заказ. */
  isOwner: boolean;
  /** Смотрит сторона сделки: клиент заказа либо компания-исполнитель. */
  isParty: boolean;
  /**
   * Статус в ответе API — настоящий, а не замаскированный.
   *
   * Backend отдаёт настоящий статус владельцу и компании с активным
   * предложением; остальным заказ приходит как «Поиск исполнителя», чем бы он
   * ни был на самом деле (ТЗ §4.1). Показывать этот подставной статус нельзя:
   * рядом стоит статус собственного предложения компании, и «Поиск
   * исполнителя» вместе с «Не выбрано» читаются как поломка.
   */
  seesRealStatus: boolean;
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

  // Компании backend отдаёт только её собственное предложение, поэтому поиск
  // по `viewerId` здесь находит ровно то, по чему решает и сервер.
  const ownOffer = order.offers.find((offer) => offer.companyId === viewerId) ?? null;

  const isParty = isOwner || (ownOffer !== null && isExecutorOffer(ownOffer.status));

  return {
    isOwner,
    isParty,
    seesRealStatus: isOwner || (ownOffer !== null && isActiveOffer(ownOffer.status)),
    clientFiles: order.files.filter((file) => file.ownerType === FileOwnerType.CLIENT),
  };
}

/**
 * Почему список файлов задания пуст.
 *
 * Компания видит задание, пока заказ принимает предложения (`companySeesTaskFiles`),
 * а заказ, который на самом деле уже кто-то выполняет, выглядит для неё как
 * «ищет исполнителя» (ТЗ §4.1). Отличить «клиент ничего не приложил» от «заказ
 * занят» она по этому ответу не может — и не должна: подсказка вроде «файлы
 * скрыты» выдавала бы настоящий статус там, где всё остальное его прячет.
 */
export function emptyClientFilesMessage({
  isOwner,
}: Pick<OrderDetailAccess, "isOwner">): string {
  return isOwner
    ? "Вы не приложили файлы к этому заказу."
    : "Клиент не приложил файлы к этому заказу.";
}
