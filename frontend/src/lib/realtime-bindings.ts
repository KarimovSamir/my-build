/**
 * Подписки на сокет без React (ТЗ §8).
 *
 * Здесь вся нетривиальная механика real-time на клиенте: перевход в комнату
 * после переподключения, перечит пропущенного, повтор при устранимом отказе
 * и снятие слушателей. React-обёртки живут в `lib/use-realtime.ts` и не делают
 * ничего, кроме вызова этих функций в эффекте.
 *
 * Разделение не косметическое: именно эта механика ломается молча — сокет жив,
 * событий нет, страница выглядит рабочей, — поэтому её надо проверять тестом,
 * а не глазами. Компонентной инфраструктуры (jsdom) в проекте нет и для этого
 * не требуется: подставить сюда нужно объект с тремя методами.
 */

import { BURST_DELAY_MS, createBurst } from "@/lib/live-updates";
import type { SubscribeAck } from "@/lib/types";

/** Сокет в том объёме, в каком его трогают подписки. */
export interface SocketLike {
  readonly connected: boolean;
  on(event: string, listener: (payload?: unknown) => void): unknown;
  off(event: string, listener: (payload?: unknown) => void): unknown;
  emit(event: string, ...args: unknown[]): unknown;
}

/** Отписаться: снять слушателей и выйти из комнаты. */
export type Unbind = () => void;

/**
 * Паузы перед повторной попыткой войти в комнату.
 *
 * Повторяется только устранимый отказ (`retryable`): недоступная база или
 * упёршийся лимит частоты. Отказ по правам не повторяется вовсе — правило
 * от этого не изменится.
 */
export const ROOM_RETRY_DELAYS_MS: readonly number[] = [1_000, 3_000, 10_000];

export interface RefreshBinding {
  /** Какие события интересны этому экрану (`lib/live-updates.ts`). */
  events: readonly string[];
  /** Что делать: перечитать заказ или страницу целиком. */
  refresh: () => void;
  /** Отсеять чужое: в личную комнату приходят события по всем заказам. */
  accepts?: (payload: unknown) => boolean;
  delay?: number;
}

/**
 * Перечитывать данные по событиям сокета и после переподключения.
 *
 * Второе не менее важно первого: socket.io ничего не буферизует, и всё, что
 * произошло за время обрыва, до вкладки не доедет никогда. На **первое**
 * подключение перечита нет намеренно — страница только что отрисована сервером.
 */
export function bindRefresh(socket: SocketLike, binding: RefreshBinding): Unbind {
  const { events, refresh, accepts, delay = BURST_DELAY_MS } = binding;

  const burst = createBurst(refresh, delay);

  const handle = (payload?: unknown) => {
    if (!accepts || accepts(payload)) burst.schedule();
  };

  // Пропущено ли что-то. Флаг ставит только разрыв.
  let missed = false;

  const onDisconnect = () => {
    missed = true;
  };

  const onConnect = () => {
    if (!missed) return;

    missed = false;
    burst.schedule();
  };

  for (const name of events) {
    socket.on(name, handle);
  }

  socket.on("disconnect", onDisconnect);
  socket.on("connect", onConnect);

  return () => {
    burst.cancel();

    for (const name of events) {
      socket.off(name, handle);
    }

    socket.off("disconnect", onDisconnect);
    socket.off("connect", onConnect);
  };
}

export interface RoomBinding {
  subscribe: string;
  unsubscribe: string;
  /** Тело сообщения: `{ orderId }` у комнаты заказа, пустое у ленты. */
  payload: Record<string, string>;
  /** Куда сообщить о неудаче. По умолчанию — предупреждение в консоль. */
  onWarn?: (message: string) => void;
  retryDelays?: readonly number[];
}

/**
 * Держать вкладку в комнате: войти сейчас и входить заново после каждого
 * переподключения.
 *
 * Комнаты живут на сервере и обрыв не переживают: переподключившийся сокет —
 * новый участник, о котором сервер ничего не помнит.
 */
export function bindRoom(socket: SocketLike, binding: RoomBinding): Unbind {
  const {
    subscribe,
    unsubscribe,
    payload,
    onWarn = defaultWarn,
    retryDelays = ROOM_RETRY_DELAYS_MS,
  } = binding;

  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearRetry = () => {
    if (timer === null) return;

    clearTimeout(timer);
    timer = null;
  };

  const join = () => {
    clearRetry();

    socket.emit(subscribe, payload, (ack?: SubscribeAck) => {
      if (ack?.ok) {
        attempt = 0;
        return;
      }

      onWarn(ack?.error ?? "в комнату не пустили");

      // Ответа нет вовсе — считаем это устранимым: сокет жив, а без комнаты
      // страница молча перестанет обновляться.
      if (ack && !ack.retryable) return;

      const delay = retryDelays[attempt];

      if (delay === undefined) return;

      attempt += 1;
      timer = setTimeout(join, delay);
    });
  };

  const onConnect = () => {
    attempt = 0;
    join();
  };

  if (socket.connected) join();
  socket.on("connect", onConnect);

  return () => {
    clearRetry();
    socket.off("connect", onConnect);

    // Отписываться имеет смысл только у живого сокета: оборванный уже выпал
    // из всех комнат, а сообщение легло бы в очередь до переподключения.
    if (socket.connected) socket.emit(unsubscribe, payload);
  };
}

function defaultWarn(message: string): void {
  console.warn(`WebSocket: ${message}`);
}

/**
 * Сколько ждать, прежде чем говорить пользователю о потере связи.
 *
 * Разрывы бывают мгновенные: переподключение после смены сети или обновления
 * токена занимает доли секунды, и мигающая надпись пугала бы там, где ничего
 * не сломалось. Столько же длится и первое рукопожатие при загрузке кабинета.
 */
export const OFFLINE_NOTICE_DELAY_MS = 3_000;

/**
 * Сообщать о состоянии связи: `false` — сокет разорван дольше `delay`,
 * `true` — подключение восстановлено.
 *
 * Нужно ровно для одного: пользователь должен отличать «событий нет, потому
 * что ничего не произошло» от «событий нет, потому что связи нет». Само по себе
 * это ничего не чинит — перечит после переподключения делает `bindRefresh`.
 */
export function bindConnection(
  socket: SocketLike,
  onChange: (online: boolean) => void,
  delay: number = OFFLINE_NOTICE_DELAY_MS,
): Unbind {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearPending = () => {
    if (timer === null) return;

    clearTimeout(timer);
    timer = null;
  };

  const onConnect = () => {
    clearPending();
    onChange(true);
  };

  const onDisconnect = () => {
    clearPending();

    timer = setTimeout(() => {
      timer = null;
      onChange(false);
    }, delay);
  };

  socket.on("connect", onConnect);
  socket.on("disconnect", onDisconnect);

  // Сокет ещё не подключён — отсчёт начинается сразу: рукопожатие может
  // и не состояться вовсе (недоступный backend), а событий об этом не будет.
  if (!socket.connected) onDisconnect();

  return () => {
    clearPending();
    socket.off("connect", onConnect);
    socket.off("disconnect", onDisconnect);
  };
}

/** Состояние связи в виде внешнего хранилища — для `useSyncExternalStore`. */
export interface ConnectionStore {
  subscribe: (notify: () => void) => Unbind;
  getSnapshot: () => boolean;
}

/**
 * Хранилище состояния связи.
 *
 * Отдельно от React намеренно: состояние живёт в сокете, а не в компоненте,
 * и подписка на него не должна превращаться в `setState` из эффекта —
 * правила React Compiler такого не допускают.
 *
 * Начальное значение — «связь есть»: иначе каждая загрузка кабинета начиналась
 * бы с надписи о потерянной связи, которая через долю секунды пропадает.
 */
export function createConnectionStore(
  socket: SocketLike | null,
  delay: number = OFFLINE_NOTICE_DELAY_MS,
): ConnectionStore {
  let online = true;

  return {
    subscribe(notify) {
      // Сокета нет — это серверный рендер: сообщать не о чем.
      if (!socket) return () => undefined;

      return bindConnection(
        socket,
        (value) => {
          if (value === online) return;

          online = value;
          notify();
        },
        delay,
      );
    },
    getSnapshot: () => online,
  };
}
