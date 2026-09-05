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

import { OfferStatus, type IsoDateString, type OfferDto } from "@/lib/types";

/** Какую дату предложения показывать и как её подписать. */
export interface OfferDate {
  label: string;
  iso: IsoDateString;
}

/**
 * Дата под названием компании.
 *
 * Отправка предложения по ТЗ §4.1 — upsert: компания меняет цену и срок
 * в той же строке, и `createdAt` после этого описывает уже не те условия,
 * которые видит клиент. Поэтому изменённое предложение подписывается датой
 * изменения — так же, как в разделе «Мои предложения» у самой компании.
 */
export function offerDate(offer: Pick<OfferDto, "createdAt" | "updatedAt">): OfferDate {
  return offer.updatedAt === offer.createdAt
    ? { label: "Предложение от", iso: offer.createdAt }
    : { label: "Обновлено", iso: offer.updatedAt };
}

export interface OfferHint {
  text: string;
  link?: { href: string; label: string };
}

/**
 * Подсказка под предложением. `null` — предложение ещё ждёт выбора клиента
 * (`isPendingOffer`), и вместо текста показываются кнопки «Изменить»
 * и «Отозвать».
 *
 * `canResubmit` приходит только с карточки заказа: там рядом с подсказкой
 * стоит настоящая кнопка «Отправить предложение», и звать в ленту за тем, что
 * уже открыто на экране, незачем. В списке «Мои предложения» этого признака
 * нет — там заказ приходит строкой списка, без права на предложение, — и
 * подсказка отправляет в ленту.
 *
 * Само право считает backend по настоящему статусу заказа: компании он виден
 * как «ищет исполнителя», даже если его давно кто-то выполняет (ТЗ §4.1), и
 * кнопка, собранная по видимому статусу, обещала бы то, на что сервер ответит
 * 409.
 *
 * Ветка `default` не нужна и вредна: перечислены все статусы, и новый
 * не соберётся, пока ему не напишут подсказку.
 */
export function offerHint(
  status: OfferStatus,
  orderId: string,
  canResubmit = false,
): OfferHint | null {
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
      return canResubmit
        ? { text: "Клиент отклонил предложение. Можно отправить новое." }
        : {
            text: "Клиент отклонил предложение. Если заказ ещё ищет исполнителя, он есть в ленте.",
            link: toFeed,
          };
    case OfferStatus.WITHDRAWN:
      return canResubmit
        ? { text: "Вы отозвали предложение. Его можно отправить заново." }
        : {
            text: "Вы отозвали предложение. Если заказ ещё ищет исполнителя, он есть в ленте.",
            link: toFeed,
          };
    case OfferStatus.NOT_ACCEPTED:
      return { text: "Клиент выбрал предложение другой компании." };
  }
}
