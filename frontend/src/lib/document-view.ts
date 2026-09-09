/**
 * Раздел «Документы»: подписи строк и варианты фильтра по заказу (ТЗ §5, §7).
 *
 * Модуль чистый — компоненты только рисуют то, что здесь собрано.
 */

import { FileOwnerType, formatOrderNumber, Role } from "@/lib/types";

/** Заказ в том виде, в каком его показывает фильтр: номер и название. */
export interface OrderOption {
  id: string;
  label: string;
}

/** Заказ, из которого собирается вариант фильтра. */
interface OrderRef {
  id: string;
  orderNumber: number;
  title: string;
}

/**
 * Варианты фильтра «Заказ».
 *
 * Порядок — по номеру заказа сверху вниз: у клиента и у компании источники
 * разные (свои заказы против принятых предложений), и без общего правила
 * список выглядел бы по-разному в двух ролях.
 *
 * Повторы отбрасываются: у компании заказ приходит через её предложение,
 * и одно предложение на заказ — это ограничение базы, а не свойство ответа.
 */
export function toOrderOptions(orders: readonly OrderRef[]): OrderOption[] {
  const byId = new Map<string, OrderRef>();

  for (const order of orders) {
    if (!byId.has(order.id)) byId.set(order.id, order);
  }

  return [...byId.values()]
    .sort((a, b) => b.orderNumber - a.orderNumber)
    .map((order) => ({
      id: order.id,
      label: `${formatOrderNumber(order.orderNumber)} · ${order.title}`,
    }));
}

/**
 * Выбранный заказ обязан быть среди вариантов, иначе поле фильтра выглядит
 * пустым при действующем фильтре — то есть как поломка.
 *
 * Разойтись они могут по-настоящему: список вариантов ограничен страницей
 * (`MAX_PAGE_SIZE`), а ссылку на конкретный заказ могли прислать. Названия
 * такого заказа взять неоткуда, поэтому вариант подписывается нейтрально —
 * номер и название видны в самих строках списка.
 */
export function withSelectedOrder(
  options: readonly OrderOption[],
  selectedId: string | null,
): OrderOption[] {
  if (selectedId === null || options.some((option) => option.id === selectedId)) {
    return [...options];
  }

  return [{ id: selectedId, label: "Выбранный заказ" }, ...options];
}

/** Свои файлы называются своими: у клиента это задание, у компании — сдачи. */
function isOwnFile(ownerType: FileOwnerType, viewer: Role): boolean {
  return ownerType === (viewer === Role.CLIENT ? FileOwnerType.CLIENT : FileOwnerType.COMPANY);
}

/**
 * Кем загружен файл (ТЗ §7) — с точки зрения смотрящего.
 *
 * Имени здесь нет намеренно: у заказа обе стороны известны из самого заказа,
 * а колонки «кто загрузил» у файла нет вовсе (`CLAUDE.md` §7).
 */
export function documentOwnerLabel(ownerType: FileOwnerType, viewer: Role): string {
  if (isOwnFile(ownerType, viewer)) return "Ваш файл";

  return ownerType === FileOwnerType.CLIENT ? "Файл клиента" : "Файл исполнителя";
}

/** Подпись вкладки фильтра «чьи файлы». */
export function documentOwnerTabLabel(ownerType: FileOwnerType, viewer: Role): string {
  if (isOwnFile(ownerType, viewer)) return "Мои файлы";

  return ownerType === FileOwnerType.CLIENT ? "Файлы клиента" : "Файлы исполнителя";
}
