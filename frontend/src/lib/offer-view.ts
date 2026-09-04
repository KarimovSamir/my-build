/**
 * Что написать компании про её предложение, когда действий по нему уже нет.
 *
 * Статус предложения сам по себе объясняет мало: «Не выбрано» не говорит,
 * можно ли что-то сделать дальше. Подсказка отвечает именно на это — и живёт
 * отдельно от разметки, чтобы каждый из восьми статусов проверялся тестом,
 * а не глазами.
 *
 * Модуль чистый — ни React, ни fetch.
 */

import { OfferStatus } from "@/lib/types";

export interface OfferHint {
  text: string;
  link?: { href: string; label: string };
}

/**
 * Подсказка под предложением. `null` — предложение ещё ждёт выбора клиента
 * (`isPendingOffer`), и вместо текста показываются кнопки «Изменить»
 * и «Отозвать».
 *
 * Кнопки «Отправить заново» здесь нет намеренно: настоящий статус заказа
 * компании не виден (ТЗ §4.1, приватность), и заказ, который уже выполняет
 * кто-то другой, выглядит для неё как «ищет исполнителя». Такая кнопка
 * обещала бы то, на что сервер ответит 409. Заказы, по которым предложение
 * действительно можно прислать заново, перечисляет лента.
 *
 * Ветка `default` не нужна и вредна: перечислены все статусы, и новый
 * не соберётся, пока ему не напишут подсказку.
 */
export function offerHint(status: OfferStatus, orderId: string): OfferHint | null {
  const openOrder = { href: `/orders/${orderId}`, label: "Открыть заказ" };
  const toFeed = { href: "/available", label: "К ленте заказов" };

  switch (status) {
    case OfferStatus.SENT:
      return null;
    case OfferStatus.ACCEPTED:
      return { text: "Клиент выбрал вас. Можно приступать к работе.", link: openOrder };
    case OfferStatus.WORK_SUBMITTED:
      return { text: "Работа сдана и ждёт подтверждения клиента.", link: openOrder };
    case OfferStatus.BACK_FOR_OVERRIDE:
      return { text: "Клиент вернул работу на доработку.", link: openOrder };
    case OfferStatus.COMPLETED:
      return { text: "Заказ завершён, клиент принял работу.", link: openOrder };
    case OfferStatus.REJECTED:
      return {
        text: "Клиент отклонил предложение. Если заказ ещё ищет исполнителя, он есть в ленте.",
        link: toFeed,
      };
    case OfferStatus.WITHDRAWN:
      return {
        text: "Вы отозвали предложение. Если заказ ещё ищет исполнителя, он есть в ленте.",
        link: toFeed,
      };
    case OfferStatus.NOT_ACCEPTED:
      return { text: "Клиент выбрал предложение другой компании." };
  }
}
