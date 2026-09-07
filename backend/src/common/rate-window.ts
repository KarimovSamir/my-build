/**
 * Скользящее окно запросов — общий счёт для HTTP и WebSocket (ТЗ §6).
 *
 * Вынесено из `ThrottleGuard` в отдельный модуль, потому что ограничивать надо
 * оба канала: guard живёт в HTTP-контексте (`switchToHttp`) и на сообщения
 * сокета не срабатывает вовсе, а сообщение `subscribe:order` ходит в базу
 * ровно так же, как маршрут REST.
 *
 * Ограничение то же, что у guard'а: счётчики живут в памяти процесса, поэтому
 * при нескольких экземплярах backend'а лимит окажется общим только внутри
 * каждого из них.
 */

/** Сколько обращений и за какое окно разрешено одному ключу. */
export interface RateWindowOptions {
  /** Максимум обращений за окно. */
  limit: number;
  /** Длина окна в миллисекундах. */
  ttl: number;
}

/** Решение по одному обращению. */
export interface RateWindowResult {
  allowed: boolean;
  /**
   * Через сколько окно освободится. Считается по самому старому обращению
   * в окне — именно оно из него выпадет первым. При `allowed: true` — 0.
   */
  retryAfterMs: number;
}

interface Window {
  /** Метки времени обращений внутри окна, от старой к новой. */
  stamps: number[];
  /** Когда это окно перестанет иметь значение и его можно удалить. */
  expiresAt: number;
}

/** Как часто выбрасывать из памяти окна, по которым давно нет обращений. */
const SWEEP_INTERVAL_MS = 60_000;

export class RateWindows {
  private readonly windows = new Map<string, Window>();
  private nextSweepAt = 0;

  /**
   * Учесть обращение и сказать, разрешено ли оно.
   *
   * Отказ обращение **не** записывает: иначе поток запросов сверх лимита
   * продлевал бы окно сам себе и не выпускал бы пользователя никогда.
   */
  hit(key: string, options: RateWindowOptions, now: number = Date.now()): RateWindowResult {
    this.sweep(now);

    const windowStart = now - options.ttl;
    const stamps = (this.windows.get(key)?.stamps ?? []).filter(
      (stamp) => stamp > windowStart,
    );

    if (stamps.length >= options.limit) {
      return { allowed: false, retryAfterMs: stamps[0]! + options.ttl - now };
    }

    stamps.push(now);
    this.windows.set(key, { stamps, expiresAt: now + options.ttl });

    return { allowed: true, retryAfterMs: 0 };
  }

  /** Забыть ключ целиком: сокет отключился — держать его окно незачем. */
  forget(prefix: string): void {
    for (const key of this.windows.keys()) {
      if (key === prefix || key.startsWith(`${prefix}:`)) {
        this.windows.delete(key);
      }
    }
  }

  /**
   * Убрать окна, срок которых истёк. Иначе карта растёт на каждого
   * пользователя и не уменьшается никогда.
   */
  private sweep(now: number): void {
    if (now < this.nextSweepAt) return;
    this.nextSweepAt = now + SWEEP_INTERVAL_MS;

    for (const [key, window] of this.windows) {
      if (window.expiresAt <= now) {
        this.windows.delete(key);
      }
    }
  }
}
