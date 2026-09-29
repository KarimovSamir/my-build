import { ServiceUnavailableException } from '@nestjs/common';

import { KeyedQueue, QueueRejectedError } from './keyed-queue.js';

/**
 * Транзакции, которые берут заказ под блокировку, — по одной на заказ.
 *
 * Сама блокировка строки (`OrderTransitionService.lockOrder`) остаётся
 * гарантией целостности; очередь лишь не даёт ждущим транзакциям занимать
 * соединения пула (см. `keyed-queue.ts`). Оборачивается только вызов
 * `$transaction`, а не метод сервиса целиком: вложенный вызов с тем же заказом
 * ждал бы сам себя.
 *
 * Живёт в модуле, а не в DI, по той же причине, что и семафор загрузок:
 * очередь одна на процесс, а транзакции по заказу открывают и модуль `orders`,
 * и `offers`, и `files`, который от `orders` зависеть не может.
 *
 * Пределы подобраны под настоящую транзакцию перехода: на проде это десятые
 * доли секунды, с машины разработчика — больше секунды (десяток запросов
 * к удалённой базе подряд). 20 секунд ожидания — столько же, сколько запросы
 * раньше простаивали на блокировке в самой базе, и с запасом до 30 секунд,
 * после которых фронт обрывает запрос.
 */
const orderQueue = new KeyedQueue({ maxWaiting: 50, maxWaitMs: 20_000 });

export const ORDER_BUSY = 'Заказ сейчас меняется, повторите через пару секунд';

/** Выполнить транзакцию по заказу в его очереди. Перегрузка — 503. */
export async function runInOrderQueue<T>(
  orderId: string,
  task: () => Promise<T>,
): Promise<T> {
  try {
    return await orderQueue.run(orderId, task);
  } catch (error) {
    // Бросает его только сама очередь и только до запуска задачи.
    if (error instanceof QueueRejectedError) {
      throw new ServiceUnavailableException(ORDER_BUSY);
    }

    throw error;
  }
}
