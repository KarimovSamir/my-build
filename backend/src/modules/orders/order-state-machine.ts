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
 */

import { ConflictException, Injectable } from '@nestjs/common';
import {
  NotificationType,
  OfferStatus,
  OrderStatus,
  formatOrderNumber,
  notificationTypeLabels,
} from '@mybuild/shared';

/** События, которые двигают заказ по статусам. */
export const OrderEventType = {
  /** Компания отправила или обновила предложение. */
  OFFER_SUBMITTED: 'OFFER_SUBMITTED',
  /** Компания отозвала своё предложение. */
  OFFER_WITHDRAWN: 'OFFER_WITHDRAWN',
  /** Клиент отклонил предложение. */
  OFFER_REJECTED: 'OFFER_REJECTED',
  /** Клиент принял предложение. */
  OFFER_ACCEPTED: 'OFFER_ACCEPTED',
  /** Компания сдала работу (первая сдача или пересдача после доработки). */
  WORK_SUBMITTED: 'WORK_SUBMITTED',
  /** Клиент подтвердил выполнение. */
  WORK_CONFIRMED: 'WORK_CONFIRMED',
  /** Клиент отправил работу на доработку. */
  WORK_DISPUTED: 'WORK_DISPUTED',
} as const;
export type OrderEventType = (typeof OrderEventType)[keyof typeof OrderEventType];

/** Снимок заказа, которого достаточно для решения о переходе. */
export interface OrderStateContext {
  orderId: string;
  orderNumber: number;
  title: string;
  clientId: string;
  status: OrderStatus;
}

interface OfferRef {
  offerId: string;
  companyId: string;
  /**
   * Статус предложения на момент события. Без него машина решала бы переход
   * по одному лишь статусу заказа, и уже отклонённое предложение можно было
   * бы отклонить второй раз, пока заказ ждёт выбора из других.
   */
  offerStatus: OfferStatus;
}

/** Чужое предложение того же заказа, всё ещё ждущее решения клиента. */
export interface RivalOffer {
  offerId: string;
  companyId: string;
}

export type OrderEvent =
  | ({ type: typeof OrderEventType.OFFER_SUBMITTED; companyName: string } & OfferRef)
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

/** 409 Conflict на любой переход, которого нет в таблице ТЗ §4. */
export class InvalidStateTransitionError extends ConflictException {
  constructor(
    readonly fromStatus: OrderStatus,
    readonly event: OrderEventType,
  ) {
    super({
      statusCode: 409,
      error: 'InvalidStateTransition',
      message: `Недопустимое действие «${event}» для заказа в статусе «${fromStatus}»`,
    });
  }
}

/**
 * 409 Conflict на событие, которому не подходит текущий статус самого
 * предложения. Отдельно от `InvalidStateTransitionError`: заказ в подходящем
 * статусе, а вот предложение — нет.
 */
export class InvalidOfferStatusError extends ConflictException {
  constructor(
    readonly offerStatus: OfferStatus,
    readonly event: OrderEventType,
  ) {
    super({
      statusCode: 409,
      error: 'InvalidOfferStatus',
      message: `Недопустимое действие «${event}» для предложения в статусе «${offerStatus}»`,
    });
  }
}

/**
 * Статусы предложения, из которых событие имеет смысл.
 *
 * Статус заказа этого не заменяет: пока заказ ждёт выбора из нескольких
 * предложений, он остаётся в `AWAITING_CONFIRMATION` — и без этой таблицы
 * одно и то же предложение можно было бы отклонить дважды.
 *
 * `OFFER_SUBMITTED` разрешён из всех статусов, кроме исполнительских:
 * компания вправе прислать предложение заново после отзыва, отказа клиента
 * или проигрыша, но не тогда, когда уже работает по заказу.
 */
const OFFER_PRECONDITIONS: Record<OrderEventType, readonly OfferStatus[]> = {
  [OrderEventType.OFFER_SUBMITTED]: [
    OfferStatus.SENT,
    OfferStatus.WITHDRAWN,
    OfferStatus.REJECTED,
    OfferStatus.NOT_ACCEPTED,
  ],
  [OrderEventType.OFFER_WITHDRAWN]: [OfferStatus.SENT],
  [OrderEventType.OFFER_REJECTED]: [OfferStatus.SENT],
  [OrderEventType.OFFER_ACCEPTED]: [OfferStatus.SENT],
  [OrderEventType.WORK_SUBMITTED]: [OfferStatus.ACCEPTED, OfferStatus.BACK_FOR_OVERRIDE],
  [OrderEventType.WORK_CONFIRMED]: [OfferStatus.WORK_SUBMITTED],
  [OrderEventType.WORK_DISPUTED]: [OfferStatus.WORK_SUBMITTED],
};

type TransitionHandler = (
  context: OrderStateContext,
  event: OrderEvent,
) => Omit<OrderTransitionResult, 'fromStatus'>;

type TransitionTable = {
  [S in OrderStatus]: Partial<Record<OrderEventType, TransitionHandler>>;
};

/** `ORD-7829 «Ремонт квартиры»` — как заказ подписан в уведомлении. */
function orderRef(context: OrderStateContext): string {
  return `${formatOrderNumber(context.orderNumber)} «${context.title}»`;
}

/** Сменить статус предложения, по которому пришло событие. */
function setOfferStatus(offer: OfferRef, status: OfferStatus): OrderSideEffect {
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

/**
 * Предложение выбыло из выбора. Заказ возвращается в поиск исполнителя
 * только если это было последнее активное предложение.
 */
function offerLeftSelection(
  offerStatus: OfferStatus,
  notifyCompany: NotificationType | null,
): TransitionHandler {
  return (context, event) => {
    if (
      event.type !== OrderEventType.OFFER_WITHDRAWN &&
      event.type !== OrderEventType.OFFER_REJECTED
    ) {
      throw unexpected(event);
    }

    const effects: OrderSideEffect[] = [setOfferStatus(event, offerStatus)];

    if (notifyCompany) {
      effects.push(
        notify(
          event.companyId,
          notifyCompany,
          `${orderRef(context)}: ваше предложение отклонено`,
        ),
      );
    }

    return {
      nextStatus:
        event.otherActiveOffers > 0
          ? OrderStatus.AWAITING_CONFIRMATION
          : OrderStatus.WAITING,
      effects,
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
        NotificationType.OFFER_REJECTED,
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
 * Таблица переходов ТЗ §4. Всё, чего здесь нет, — ошибка 409.
 *
 * Статус-ключи перечислены явно и проверяются типом: добавив статус в enum,
 * его нельзя забыть описать здесь — не соберётся.
 */
const TRANSITIONS: TransitionTable = {
  [OrderStatus.WAITING]: {
    [OrderEventType.OFFER_SUBMITTED]: offerSubmitted,
  },

  [OrderStatus.AWAITING_CONFIRMATION]: {
    // Заказ уже в этом статусе, но событие разрешено: предложение от ещё
    // одной компании — норма, а не конфликт.
    [OrderEventType.OFFER_SUBMITTED]: offerSubmitted,
    [OrderEventType.OFFER_WITHDRAWN]: offerLeftSelection(OfferStatus.WITHDRAWN, null),
    [OrderEventType.OFFER_REJECTED]: offerLeftSelection(
      OfferStatus.REJECTED,
      NotificationType.OFFER_REJECTED,
    ),
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
    const handler = TRANSITIONS[context.status][event.type];

    if (!handler) {
      throw new InvalidStateTransitionError(context.status, event.type);
    }

    // Статус заказа проверяется первым: он описывает переход целиком,
    // а статус предложения — только право этого предложения в нём участвовать.
    if (!OFFER_PRECONDITIONS[event.type].includes(event.offerStatus)) {
      throw new InvalidOfferStatusError(event.offerStatus, event.type);
    }

    return { fromStatus: context.status, ...handler(context, event) };
  }

  /** Разрешено ли событие в текущем статусе. Для показа кнопок в интерфейсе. */
  can(status: OrderStatus, event: OrderEventType): boolean {
    return Boolean(TRANSITIONS[status][event]);
  }
}

/** Статус, с которого начинается жизнь заказа (ТЗ §4). */
export const INITIAL_ORDER_STATUS = OrderStatus.WAITING;
