/**
 * Очередь задач по ключу: задачи с одним ключом выполняются строго по одной,
 * с разными — параллельно.
 *
 * Нужна там, где задачи с одним ключом всё равно встанут друг за другом, но
 * ждать им дороже в другом месте. Транзакции по одному заказу упираются
 * в `SELECT … FOR UPDATE` (`OrderTransitionService.lockOrder`), и ждущая
 * транзакция при этом держит соединение из пула: три десятка одновременных
 * запросов к одному заказу выбирали весь пул, и посторонний `GET /profile`
 * стоял за ними секундами. В этой очереди ждут в памяти процесса, соединение
 * берёт только тот, чья очередь подошла.
 *
 * Ожидание конечно с обеих сторон: длина очереди на ключ и время в ней
 * ограничены. Отказ — `QueueRejectedError`, его вызывающий код переводит
 * в «повторите позже», а не в падение.
 *
 * Очередь живёт в памяти процесса — при нескольких экземплярах backend'а она
 * общая только внутри каждого (та же оговорка, что у `ThrottleGuard`).
 */

export interface KeyedQueueOptions {
  /** Сколько задач может ждать своей очереди на одном ключе. */
  maxWaiting: number;
  /** Сколько задача может ждать своей очереди, миллисекунд. */
  maxWaitMs: number;
}

/** Задача не дождалась очереди: ключ перегружен. */
export class QueueRejectedError extends Error {
  constructor(readonly reason: 'full' | 'timeout') {
    super(reason === 'full' ? 'Очередь переполнена' : 'Очередь не дошла вовремя');
    this.name = 'QueueRejectedError';
  }
}

interface Waiter {
  resolve: () => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Ключ, по которому сейчас выполняется задача, и те, кто ждёт за ней. */
interface Lane {
  waiting: Waiter[];
}

export class KeyedQueue {
  /** Полоса есть ровно тогда, когда по ключу что-то выполняется. */
  private readonly lanes = new Map<string, Lane>();

  constructor(private readonly options: KeyedQueueOptions) {}

  /**
   * Выполнить задачу, дождавшись своей очереди по ключу.
   *
   * `QueueRejectedError` бросается только до запуска задачи: ошибки самой
   * задачи уходят наружу как есть. Задача не должна ставить в очередь новую
   * задачу с тем же ключом — она ждала бы сама себя до отказа по времени.
   */
  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    await this.acquire(key);

    try {
      return await task();
    } finally {
      this.release(key);
    }
  }

  /** Сколько задач ждёт по ключу, не считая выполняемой. Для тестов. */
  waitingCount(key: string): number {
    return this.lanes.get(key)?.waiting.length ?? 0;
  }

  private acquire(key: string): Promise<void> {
    const lane = this.lanes.get(key);

    if (!lane) {
      this.lanes.set(key, { waiting: [] });
      return Promise.resolve();
    }

    if (lane.waiting.length >= this.options.maxWaiting) {
      return Promise.reject(new QueueRejectedError('full'));
    }

    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        timer: setTimeout(() => {
          const index = lane.waiting.indexOf(waiter);
          if (index !== -1) lane.waiting.splice(index, 1);
          reject(new QueueRejectedError('timeout'));
        }, this.options.maxWaitMs),
      };

      // Таймер ожидания не должен держать процесс живым при остановке.
      waiter.timer.unref?.();
      lane.waiting.push(waiter);
    });
  }

  /** Передать ключ следующему в очереди, а если его нет — освободить. */
  private release(key: string): void {
    const lane = this.lanes.get(key);
    if (!lane) return;

    const next = lane.waiting.shift();

    if (next) {
      clearTimeout(next.timer);
      next.resolve();
    } else {
      this.lanes.delete(key);
    }
  }
}
