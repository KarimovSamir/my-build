/**
 * Что написать сторонам сделки на этапе приёмки работы (ТЗ §4).
 *
 * Статус сам по себе объясняет мало: «Ожидание подтверждения выполнения»
 * не говорит, чьего именно решения ждут. Текст отвечает на это — и живёт
 * отдельно от разметки, чтобы каждый статус проверялся тестом, а не глазами.
 *
 * Ветки `default` нет намеренно: перечислены все статусы, и новый не соберётся,
 * пока ему не напишут текст.
 *
 * Модуль чистый — ни React, ни fetch.
 */

import { OrderStatus } from "@/lib/types";

/**
 * Строка над кнопками приёмки. `null` — приёмка ещё не начиналась, и блока
 * на странице нет вовсе.
 */
export function completionHint(status: OrderStatus, isOwner: boolean): string | null {
  switch (status) {
    case OrderStatus.WAITING:
    case OrderStatus.AWAITING_CONFIRMATION:
    case OrderStatus.IN_PROGRESS:
      return null;

    case OrderStatus.AWAITING_COMPLETION_CONFIRMATION:
      return isOwner
        ? "Компания сдала работу. Проверьте файлы сдачи и подтвердите выполнение или отправьте на доработку."
        : "Работа сдана и ждёт решения клиента.";

    case OrderStatus.COMPLETION_DISPUTED:
      return isOwner
        ? "Работа вернулась исполнителю. Решение можно будет принять снова, когда компания пересдаст её."
        : "Клиент вернул работу на доработку.";

    case OrderStatus.COMPLETED:
      return isOwner ? "Вы приняли работу, заказ завершён." : "Клиент принял работу.";
  }
}
