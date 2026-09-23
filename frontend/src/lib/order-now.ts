/**
 * Блок «Что сейчас» на карточке заказа (макет кабинета, правая колонка).
 *
 * Статус словом отвечает «где заказ», но не отвечает «чего ждут и от кого».
 * Здесь второе — с точки зрения того, кто смотрит: у клиента и у исполнителя
 * в одном и том же статусе ждут разного.
 *
 * Текст не повторяет подсказки блоков слева (`workHint`, `completionHint`):
 * те говорят, что нажать, а этот — что происходит с заказом. Три одинаковые
 * фразы подряд читаются как сбой, а не как объяснение.
 *
 * Ветки `default` нет намеренно: перечислены все статусы, и новый не соберётся,
 * пока ему не напишут текст.
 *
 * Модуль чистый: ни React, ни fetch.
 */

import { OrderStatus, orderStatusLabels } from "@/lib/types";

export interface OrderNow {
  /** Статус словом — тот же, что на badge. */
  title: string;
  /** Что это значит и чьего действия ждут. */
  text: string;
}

/** Кто смотрит. Третий случай — компания с активным предложением. */
export interface OrderNowViewer {
  isOwner: boolean;
  isExecutor: boolean;
}

export function resolveOrderNow(
  status: OrderStatus,
  viewer: OrderNowViewer,
): OrderNow {
  return {
    title: orderStatusLabels[status],
    text: viewer.isOwner ? clientText(status) : companyText(status, viewer.isExecutor),
  };
}

function clientText(status: OrderStatus): string {
  switch (status) {
    case OrderStatus.WAITING:
      return "Заказ виден компаниям в ленте. Первое предложение придёт уведомлением — выбирать исполнителя будете вы.";

    case OrderStatus.AWAITING_CONFIRMATION:
      return "Предложения продолжают приходить, пока вы не выбрали исполнителя. Примете одно — остальные получат «Не выбрано», а цена сделки зафиксируется.";

    case OrderStatus.IN_PROGRESS:
      return "Исполнитель выбран, цена и срок зафиксированы. Файлы работы появятся в заказе по мере того, как он их приложит.";

    case OrderStatus.AWAITING_COMPLETION_CONFIRMATION:
      return "Работа сдана, и решение за вами: подтвердить выполнение или вернуть на доработку с комментарием.";

    case OrderStatus.COMPLETION_DISPUTED:
      return "Работа вернулась исполнителю с вашим комментарием. Решение вы примете снова, когда он пересдаст её.";

    case OrderStatus.COMPLETED:
      return "Заказ завершён. Файлы всех сдач остаются в заказе и в разделе «Документы».";
  }
}

/**
 * Компания без принятого предложения видит настоящий статус только с активным
 * предложением (ТЗ §4.1), то есть застаёт заказ в поиске исполнителя или в
 * ожидании выбора. Остальные статусы у неё — это уже роль исполнителя.
 */
function companyText(status: OrderStatus, isExecutor: boolean): string {
  switch (status) {
    case OrderStatus.WAITING:
      return "Заказ ищет исполнителя. Предложение с ценой и сроком отправляется прямо отсюда.";

    case OrderStatus.AWAITING_CONFIRMATION:
      return isExecutor
        ? "Ваше предложение принимается клиентом. Пока решение не принято, условия можно изменить или отозвать."
        : "Клиент выбирает исполнителя. Пока выбор не сделан, свои условия можно изменить или отозвать.";

    case OrderStatus.IN_PROGRESS:
      return "Заказ ваш: клиент выбрал ваше предложение. Цена и срок зафиксированы теми, что вы предложили.";

    case OrderStatus.AWAITING_COMPLETION_CONFIRMATION:
      return "Работа передана клиенту. Он подтвердит выполнение или вернёт заказ на доработку с комментарием.";

    case OrderStatus.COMPLETION_DISPUTED:
      return "Клиент вернул работу с комментарием. Новая сдача уйдёт ему на подтверждение.";

    case OrderStatus.COMPLETED:
      return "Клиент принял работу. Заказ засчитан в завершённые и виден в вашей карточке подрядчика.";
  }
}
