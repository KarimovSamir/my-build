/**
 * Квоты хранилища: сколько места файлы могут занять на заказ, на заказчика
 * и на весь сервис.
 *
 * Один потолок на заказ (`MAX_ORDER_FILES_BYTES`) хранилище не бережёт: заказов
 * можно создать сколько угодно, и 50 МБ на каждый за двадцать запросов в минуту
 * выбирают гигабайт бесплатного Supabase Storage быстрее, чем кто-то заметит.
 * Поэтому потолков три, и каждый закрывает свою дыру:
 *
 * - **заказ** — чтобы один заказ не съел место заказчика целиком;
 * - **заказчик** — чтобы одна учётка (в том числе общая демо-учётка с экрана
 *   входа) не съела место остальных;
 * - **сервис** — жёсткая граница бесплатного тарифа: сколько бы учёток
 *   ни завели, дальше неё хранилище не растёт.
 *
 * Места считаются по строкам `OrderFile`, а не по бакету: объект без строки
 * появляется только при сбое уборки, а спрашивать бакет на каждую загрузку —
 * это внешний запрос с пагинацией.
 */

import { FileOwnerType, MAX_ORDER_FILES_BYTES } from '@mybuild/shared';

const MB = 1024 * 1024;

/**
 * Все файлы всех заказов одного заказчика — и его задания, и сдачи
 * исполнителей. Исполнитель в заказ попадает только по выбору заказчика,
 * поэтому его файлы — это тоже место, которое заказчик отдал своему заказу.
 * Три полных заказа.
 */
export const MAX_CLIENT_FILES_BYTES = 150 * MB;

/**
 * Все файлы сервиса. Бесплатный Supabase Storage даёт 1 ГБ; запас — на объекты,
 * которые остались в бакете без строки после сбоя уборки, и на гонку двух
 * параллельных загрузок: проверка идёт без блокировки, и каждая из них видит
 * место, ещё не занятое другой.
 */
export const MAX_TOTAL_FILES_BYTES = 800 * MB;

/** Занятое место в байтах — по тем же трём границам. */
export interface StorageUsage {
  order: number;
  client: number;
  total: number;
}

export type QuotaScope = 'order' | 'client' | 'total';

export interface QuotaRefusal {
  scope: QuotaScope;
  message: string;
}

/** Байты в мегабайты для текста ошибки: «14,5», а не «15204352». */
export function toMegabytes(bytes: number): string {
  return (bytes / MB).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}

/**
 * Помещаются ли новые файлы. `null` — помещаются.
 *
 * Границы проверяются от узкой к широкой: пользователю полезнее всего самая
 * близкая к нему причина. `uploader` нужен только тексту — место заказчика
 * у исполнителя кончается не по его вине, и «ваши заказы» ему не скажешь.
 */
export function checkStorageQuota(
  usage: StorageUsage,
  incoming: number,
  uploader: FileOwnerType,
): QuotaRefusal | null {
  if (usage.order + incoming > MAX_ORDER_FILES_BYTES) {
    return {
      scope: 'order',
      message:
        `Файлы заказа не помещаются в ${toMegabytes(MAX_ORDER_FILES_BYTES)} МБ: ` +
        `занято ${toMegabytes(usage.order)} МБ, добавляется ${toMegabytes(incoming)} МБ`,
    };
  }

  if (usage.client + incoming > MAX_CLIENT_FILES_BYTES) {
    const whose =
      uploader === FileOwnerType.CLIENT
        ? 'Место под файлы ваших заказов закончилось'
        : 'У заказчика закончилось место под файлы заказов';

    return {
      scope: 'client',
      message:
        `${whose}: занято ${toMegabytes(usage.client)} из ` +
        `${toMegabytes(MAX_CLIENT_FILES_BYTES)} МБ, добавляется ${toMegabytes(incoming)} МБ`,
    };
  }

  if (usage.total + incoming > MAX_TOTAL_FILES_BYTES) {
    return {
      scope: 'total',
      message: 'Хранилище файлов сервиса заполнено. Попробуйте позже',
    };
  }

  return null;
}

/**
 * Место, обещанное загрузкам, которые ещё едут в бакет.
 *
 * Окончательная проверка квоты идёт под транзакцией вставки, то есть уже
 * после загрузки в хранилище, а строк `OrderFile` до неё нет. Без резерва
 * двадцать параллельных запросов по 50 МБ все проходили предварительную
 * проверку и заливали в бакет гигабайт: лишнее потом отклонялось и удалялось,
 * но бесплатный лимит хранилища на это время был превышен. Резерв учитывается
 * предварительной проверкой, поэтому залить больше квоты нельзя и на время.
 *
 * Живёт в памяти процесса — как семафор загрузок и по той же причине
 * (один экземпляр backend'а — условие деплоя).
 */
export class StorageReservations {
  private readonly byOrder = new Map<string, number>();
  private readonly byClient = new Map<string, number>();
  private total = 0;

  /** Сколько места сейчас обещано по тем же трём границам. */
  pending(orderId: string, clientId: string): StorageUsage {
    return {
      order: this.byOrder.get(orderId) ?? 0,
      client: this.byClient.get(clientId) ?? 0,
      total: this.total,
    };
  }

  /** Занять место. Возвращает освобождение — звать ровно один раз. */
  reserve(orderId: string, clientId: string, bytes: number): () => void {
    adjust(this.byOrder, orderId, bytes);
    adjust(this.byClient, clientId, bytes);
    this.total += bytes;

    let released = false;

    return () => {
      if (released) return;
      released = true;

      adjust(this.byOrder, orderId, -bytes);
      adjust(this.byClient, clientId, -bytes);
      this.total -= bytes;
    };
  }
}

/** Сложить занятое в базе и обещанное. */
export function addUsage(a: StorageUsage, b: StorageUsage): StorageUsage {
  return { order: a.order + b.order, client: a.client + b.client, total: a.total + b.total };
}

function adjust(map: Map<string, number>, key: string, delta: number): void {
  const next = (map.get(key) ?? 0) + delta;

  // Пустые записи убираются, иначе карта росла бы на каждый заказ навсегда.
  if (next <= 0) map.delete(key);
  else map.set(key, next);
}
