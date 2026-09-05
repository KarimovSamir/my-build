/**
 * State-машина заказа — ядро системы (ТЗ §4).
 *
 * Это чистая функция: `(контекст заказа, событие) → { следующий статус,
 * побочные эффекты }`. Внутри нет ни базы, ни сети, ни времени — всё, что
 * нужно для решения, приходит в контексте и событии. Благодаря этому
 * переходы тестируются целиком и мгновенно, без поднятия приложения.
 *
 * Применяет эффекты и открывает транзакцию сервис-обёртка
 * `OrderTransitionService`. Здесь их только описывают.
 *
 * Сами правила («какое событие допустимо в каком статусе») лежат в `shared/`:
 * по ним интерфейс собирает состав кнопок. Здесь к ним добавляются обработчики
 * — то, что происходит при переходе.
 */

import { ConflictException, Injectable } from '@nestjs/common';
import {
  NotificationType,
  OFFER_PRECONDITIONS,
  OfferStatus,
  OrderEventType,
  OrderStatus,
  canTransition,
  notificationTypeLabels,
  offerStatusLabels,
  orderEventLabels,
  type AllowedOrderEvent,
} from '@mybuild/shared';

import { orderRef } from './order-notification.js';

// Событие приходит в сигнатурах всего модуля заказов — реэкспорт избавляет
// вызывающий код от второго импорта рядом с этим.
export { OrderEventType };

/** Снимок заказа, которого достаточно для решения о переходе. */
export interface OrderStateContext {
  orderId: string;
  orderNumber: number;
  title: string;
  clientId: string;
  status: OrderStatus;
}

/** Кого касается событие: предложение и компания за ним. */
interface OfferOwner {
  offerId: string;
  companyId: string;
}

interface OfferRef extends OfferOwner {
  /**
   * Статус предложения на момент события. Без него машина решала бы переход
   * по одному лишь статусу заказа, и уже отклонённое предложение можно было
   * бы отклонить второй раз, пока заказ ждёт выбора из других.
   */
  offerStatus: OfferStatus;
}

/**
 * То же для события «компания прислала предложение».
 *
 * Статус здесь — тот, что был у предложения **до** записи вызывающим кодом,
 * а `null` означает «предложения ещё не было, оно создаётся сейчас». Разница
 * принципиальная: отправка предложения по ТЗ §4.1 — это upsert, и если читать
 * статус из базы после записи, там всегда окажется `SENT`, то есть проверка
 * предусловия перестанет что-либо значить, ничем себя не выдав.
 */
interface SubmittedOfferRef extends OfferOwner {
  offerStatus: OfferStatus | null;
}

/** Чужое предложение того же заказа, всё ещё ждущее решения клиента. */
export interface RivalOffer {
  offerId: string;
  companyId: string;
}

export type OrderEvent =
  | ({
      type: typeof OrderEventType.OFFER_SUBMITTED;
      companyName: string;
    } & SubmittedOfferRef)
  /**
   * `otherActiveOffers` — сколько предложений в статусе SENT останется
   * у заказа, кроме этого. Ноль означает, что клиенту больше не из чего
   * выбирать и заказ возвращается в поиск исполнителя (ТЗ §4).
   */
  | ({ type: typeof OrderEventType.OFFER_WITHDRAWN; otherActiveOffers: number } & OfferRef)
  | ({ type: typeof OrderEventType.OFFER_REJECTED; otherActiveOffers: number } & OfferRef)
  | ({
      type: typeof OrderEventType.OFFER_ACCEPTED;
      proposedPrice: string;
      proposedDeadline: Date;
      /**
       * Остальные предложения заказа в статусе SENT: они проигрывают выбор.
       * Список, а не счётчик, — каждой компании нужно и сменить статус,
       * и отправить уведомление (ТЗ §8).
       */
      otherOffers: RivalOffer[];
    } & OfferRef)
  | ({ type: typeof OrderEventType.WORK_SUBMITTED } & OfferRef)
  | ({ type: typeof OrderEventType.WORK_CONFIRMED; completionComment?: string } & OfferRef)
  | ({ type: typeof OrderEventType.WORK_DISPUTED; correctionComment: string } & OfferRef);

/**
 * Что нужно записать в базу вместе со сменой статуса.
 * Все эффекты перехода применяются в одной транзакции (ТЗ §12.2).
 */
export type OrderSideEffect =
  /**
   * Сменить статус предложения. `companyId` здесь не для записи в базу,
   * а для адресата: по нему Фаза 5 разошлёт `offer:status_changed` (ТЗ §8).
   */
  | {
      kind: 'SET_OFFER_STATUS';
      offerId: string;
      companyId: string;
      status: OfferStatus;
    }
  /** Зафиксировать цену и срок сделки из принятого предложения. */
  | { kind: 'SET_ORDER_DEAL'; price: string; deadline: Date }
  /** Комментарий клиента к доработке. */
  | { kind: 'SET_CORRECTION_COMMENT'; comment: string }
  /** Комментарий клиента при приёмке. */
  | { kind: 'SET_COMPLETION_COMMENT'; comment: string | null }
  /** Уведомление в БД + отправка по WebSocket (ТЗ §8). */
  | {
      kind: 'CREATE_NOTIFICATION';
      userId: string;
      type: NotificationType;
      title: string;
      body: string;
    };

export interface OrderTransitionResult {
  fromStatus: OrderStatus;
  nextStatus: OrderStatus;
  effects: OrderSideEffect[];
}

/**
 * 409 Conflict на любой переход, которого нет в таблице ТЗ §4.
 *
 * Статуса заказа в тексте нет намеренно: сообщение уходит пользователю как
 * есть, а настоящий статус видят только стороны сделки (ТЗ §4.1). Назови его
 * ошибка — и компания, отправившая предложение на занятый заказ, узнала бы
 * из 409 ровно то, что весь остальной код от неё скрывает. Сам статус
 * остаётся полем исключения: для логов и тестов он нужен.
 */
export class InvalidStateTransitionError extends ConflictException {
  constructor(
    readonly fromStatus: OrderStatus,
    readonly event: OrderEventType,
  ) {
    super({
      statusCode: 409,
      error: 'InvalidStateTransition',
      message:
        `Действие «${orderEventLabels[event]}» сейчас недоступно для этого заказа. ` +
        'Обновите страницу — состояние могло измениться.',
    });
  }
}

/**
 * 409 Conflict на событие, которому не подходит текущий статус самого
 * предложения. Отдельно от `InvalidStateTransitionError`: заказ в подходящем
 * статусе, а вот предложение — нет.
 *
 * Статус предложения в тексте есть, и это не противоречит приватности §4.1:
 * своё предложение видит и компания, и клиент заказа, а чужих сюда попасть
 * не может — право на предложение проверяется до перехода.
 */
export class InvalidOfferStatusError extends ConflictException {
  constructor(
    readonly offerStatus: OfferStatus,
    readonly event: OrderEventType,
  ) {
    super({
      statusCode: 409,
      error: 'InvalidOfferStatus',
      message:
        `Действие «${orderEventLabels[event]}» недоступно: ` +
        `предложение в статусе «${offerStatusLabels[offerStatus]}».`,
    });
  }
}

type TransitionHandler = (
  context: OrderStateContext,
  event: OrderEvent,
) => Omit<OrderTransitionResult, 'fromStatus'>;

/**
 * Обработчик на каждое событие, разрешённое в статусе, — и ни одного лишнего.
 *
 * Состав ключей выводится из `ORDER_TRANSITIONS`, а не пишется руками:
 * забытый обработчик и обработчик на событие, которого в статусе быть не может,
 * одинаково не собираются. Иначе таблица правил в `shared/` и таблица
 * обработчиков здесь тихо разошлись бы.
 */
type TransitionTable = {
  [S in OrderStatus]: { [E in AllowedOrderEvent<S>]: TransitionHandler };
};

/** Сменить статус предложения, по которому пришло событие. */
function setOfferStatus(offer: OfferOwner, status: OfferStatus): OrderSideEffect {
  return {
    kind: 'SET_OFFER_STATUS',
    offerId: offer.offerId,
    companyId: offer.companyId,
    status,
  };
}

function notify(
  userId: string,
  type: NotificationType,
  body: string,
): OrderSideEffect {
  return {
    kind: 'CREATE_NOTIFICATION',
    userId,
    type,
    title: notificationTypeLabels[type],
    body,
  };
}

/**
 * Компания отправила предложение. Заказ переходит в «ожидает подтверждения»
 * и остаётся в нём, пока не выбран исполнитель: предложений от разных
 * компаний может прийти сколько угодно (ТЗ §4.1).
 */
const offerSubmitted: TransitionHandler = (context, event) => {
  if (event.type !== OrderEventType.OFFER_SUBMITTED) throw unexpected(event);

  return {
    nextStatus: OrderStatus.AWAITING_CONFIRMATION,
    effects: [
      setOfferStatus(event, OfferStatus.SENT),
      notify(
        context.clientId,
        NotificationType.OFFER_RECEIVED,
        `${orderRef(context)}: предложение от «${event.companyName}»`,
      ),
    ],
  };
};

/** Кому и о чём сообщить, когда предложение выбыло из выбора. */
interface LeftSelectionNotice {
  /** `client` — владелец заказа, `company` — компания за предложением. */
  to: 'client' | 'company';
  type: NotificationType;
  /** Текст после номера и названия заказа. */
  body: string;
}

/**
 * Предложение выбыло из выбора. Заказ возвращается в поиск исполнителя
 * только если это было последнее активное предложение.
 *
 * Уведомление адресовано той стороне, которая ничего не делала: клиент
 * отклонил — узнаёт компания, компания отозвала — узнаёт клиент. Сообщать
 * человеку о его же действии незачем, а молчать нельзя: отзыв возвращает
 * заказ в поиск исполнителя чужими руками, и это ровно тот случай, для
 * которого ТЗ §8 требует уведомления вместе с переходом.
 */
function offerLeftSelection(
  offerStatus: OfferStatus,
  notice: LeftSelectionNotice,
): TransitionHandler {
  return (context, event) => {
    if (
      event.type !== OrderEventType.OFFER_WITHDRAWN &&
      event.type !== OrderEventType.OFFER_REJECTED
    ) {
      throw unexpected(event);
    }

    return {
      nextStatus:
        event.otherActiveOffers > 0
          ? OrderStatus.AWAITING_CONFIRMATION
          : OrderStatus.WAITING,
      effects: [
        setOfferStatus(event, offerStatus),
        notify(
          notice.to === 'client' ? context.clientId : event.companyId,
          notice.type,
          `${orderRef(context)}: ${notice.body}`,
        ),
      ],
    };
  };
}

const offerAccepted: TransitionHandler = (context, event) => {
  if (event.type !== OrderEventType.OFFER_ACCEPTED) throw unexpected(event);

  const effects: OrderSideEffect[] = [
    setOfferStatus(event, OfferStatus.ACCEPTED),
    {
      kind: 'SET_ORDER_DEAL',
      price: event.proposedPrice,
      deadline: event.proposedDeadline,
    },
    notify(
      event.companyId,
      NotificationType.OFFER_ACCEPTED,
      `${orderRef(context)}: ваше предложение принято, можно приступать`,
    ),
  ];

  // Проигравшие перечисляются поимённо, а не одним «отклонить остальные»:
  // смена статуса без уведомления оставила бы компанию без ответа, а Фазу 5 —
  // без адресатов события `offer:status_changed` (ТЗ §8).
  //
  // Тип уведомления свой, а не `OFFER_REJECTED`: заголовок берётся из типа,
  // и «Предложение отклонено» на чужую победу — неправда. Предложение уходит
  // в `NOT_ACCEPTED` («Не выбрано»), и уведомление обязано говорить то же.
  for (const rival of event.otherOffers) {
    effects.push(
      {
        kind: 'SET_OFFER_STATUS',
        offerId: rival.offerId,
        companyId: rival.companyId,
        status: OfferStatus.NOT_ACCEPTED,
      },
      notify(
        rival.companyId,
        NotificationType.OFFER_NOT_ACCEPTED,
        `${orderRef(context)}: клиент выбрал другое предложение`,
      ),
    );
  }

  return { nextStatus: OrderStatus.IN_PROGRESS, effects };
};

const workSubmitted: TransitionHandler = (context, event) => {
  if (event.type !== OrderEventType.WORK_SUBMITTED) throw unexpected(event);

  return {
    nextStatus: OrderStatus.AWAITING_COMPLETION_CONFIRMATION,
    effects: [
      setOfferStatus(event, OfferStatus.WORK_SUBMITTED),
      notify(
        context.clientId,
        NotificationType.WORK_SUBMITTED,
        `${orderRef(context)}: работа сдана и ждёт вашего подтверждения`,
      ),
    ],
  };
};

const workConfirmed: TransitionHandler = (context, event) => {
  if (event.type !== OrderEventType.WORK_CONFIRMED) throw unexpected(event);

  return {
    nextStatus: OrderStatus.COMPLETED,
    effects: [
      setOfferStatus(event, OfferStatus.COMPLETED),
      { kind: 'SET_COMPLETION_COMMENT', comment: event.completionComment ?? null },
      notify(
        event.companyId,
        NotificationType.WORK_CONFIRMED,
        `${orderRef(context)}: клиент принял работу`,
      ),
    ],
  };
};

const workDisputed: TransitionHandler = (context, event) => {
  if (event.type !== OrderEventType.WORK_DISPUTED) throw unexpected(event);

  return {
    nextStatus: OrderStatus.COMPLETION_DISPUTED,
    effects: [
      setOfferStatus(event, OfferStatus.BACK_FOR_OVERRIDE),
      { kind: 'SET_CORRECTION_COMMENT', comment: event.correctionComment },
      notify(
        event.companyId,
        NotificationType.WORK_DISPUTED,
        `${orderRef(context)}: клиент отправил работу на доработку`,
      ),
    ],
  };
};

/**
 * Обработчик получил событие не своего типа. Возможно только при ошибке
 * в самой таблице переходов — снаружи такое собрать нельзя.
 */
function unexpected(event: OrderEvent): Error {
  return new Error(`Обработчик перехода вызван с событием ${event.type}`);
}

/**
 * Обработчики переходов ТЗ §4. Какие события здесь возможны, решает
 * `ORDER_TRANSITIONS` из `shared/`; всё, чего нет там, — ошибка 409.
 */
const TRANSITIONS: TransitionTable = {
  [OrderStatus.WAITING]: {
    [OrderEventType.OFFER_SUBMITTED]: offerSubmitted,
  },

  [OrderStatus.AWAITING_CONFIRMATION]: {
    [OrderEventType.OFFER_SUBMITTED]: offerSubmitted,
    [OrderEventType.OFFER_WITHDRAWN]: offerLeftSelection(OfferStatus.WITHDRAWN, {
      to: 'client',
      type: NotificationType.OFFER_WITHDRAWN,
      body: 'компания отозвала своё предложение',
    }),
    [OrderEventType.OFFER_REJECTED]: offerLeftSelection(OfferStatus.REJECTED, {
      to: 'company',
      type: NotificationType.OFFER_REJECTED,
      body: 'ваше предложение отклонено',
    }),
    [OrderEventType.OFFER_ACCEPTED]: offerAccepted,
  },

  [OrderStatus.IN_PROGRESS]: {
    [OrderEventType.WORK_SUBMITTED]: workSubmitted,
  },

  [OrderStatus.AWAITING_COMPLETION_CONFIRMATION]: {
    [OrderEventType.WORK_CONFIRMED]: workConfirmed,
    [OrderEventType.WORK_DISPUTED]: workDisputed,
  },

  // Пересдача после доработки.
  [OrderStatus.COMPLETION_DISPUTED]: {
    [OrderEventType.WORK_SUBMITTED]: workSubmitted,
  },

  // Терминальный статус: из завершённого заказа выходов нет.
  [OrderStatus.COMPLETED]: {},
};

/**
 * Обработчик перехода или `undefined`, если события в этом статусе нет.
 *
 * Приведение нужно из-за самой строгости `TransitionTable`: у каждого статуса
 * свой набор ключей, и обратиться к нему произвольным событием иначе нельзя.
 * Оно безопасно ровно потому, что набор ключей выведен из `ORDER_TRANSITIONS`.
 */
function handlerFor(
  status: OrderStatus,
  event: OrderEventType,
): TransitionHandler | undefined {
  const handlers = TRANSITIONS[status] as Partial<
    Record<OrderEventType, TransitionHandler>
  >;

  return handlers[event];
}

@Injectable()
export class OrderStateMachine {
  /**
   * Посчитать переход. В базу не ходит и ничего не меняет —
   * возвращает следующий статус и список эффектов для применения.
   *
   * @throws InvalidStateTransitionError если перехода нет в таблице ТЗ §4.
   * @throws InvalidOfferStatusError если событию не подходит статус предложения.
   */
  transition(context: OrderStateContext, event: OrderEvent): OrderTransitionResult {
    const handler = handlerFor(context.status, event.type);

    // Допустимость события решает `ORDER_TRANSITIONS`, а не наличие
    // обработчика: лишняя строка в таблице обработчиков иначе разрешила бы
    // на сервере то, чего интерфейс по той же таблице не показывает.
    // Обратное невозможно по типам — обработчик разрешённого события забыть
    // нельзя, сборка не пройдёт.
    if (!handler || !canTransition(context.status, event.type)) {
      throw new InvalidStateTransitionError(context.status, event.type);
    }

    // Статус заказа проверяется первым: он описывает переход целиком,
    // а статус предложения — только право этого предложения в нём участвовать.
    // `null` бывает у одного события — «компания прислала предложение» — и
    // означает, что предложения ещё не было: предусловию нечего проверять.
    const { offerStatus } = event;

    if (offerStatus !== null && !OFFER_PRECONDITIONS[event.type].includes(offerStatus)) {
      throw new InvalidOfferStatusError(offerStatus, event.type);
    }

    return { fromStatus: context.status, ...handler(context, event) };
  }

  /**
   * Разрешено ли событие. Для показа кнопок в интерфейсе.
   *
   * Считает `canTransition` из `shared/` — та же функция, что и на фронте:
   * состав кнопок и ответ сервера обязаны сходиться, а два одинаковых
   * условия в разных пакетах рано или поздно расходятся.
   */
  can(
    status: OrderStatus,
    event: OrderEventType,
    offerStatus?: OfferStatus | null,
  ): boolean {
    return canTransition(status, event, offerStatus);
  }
}

/** Статус, с которого начинается жизнь заказа (ТЗ §4). */
export const INITIAL_ORDER_STATUS = OrderStatus.WAITING;
