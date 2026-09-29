import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KeyedQueue, QueueRejectedError } from './keyed-queue.js';
import { runInOrderQueue } from './order-queue.js';

/** Задача, которую тест завершает вручную. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

/** Дать очереди микрозадач разойтись. */
async function flush(): Promise<void> {
  for (let step = 0; step < 5; step += 1) {
    // Последовательность и есть смысл: каждый шаг — один оборот микрозадач.
    // oxlint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

const OPTIONS = { maxWaiting: 2, maxWaitMs: 1_000 };

afterEach(() => {
  vi.useRealTimers();
});

describe('KeyedQueue', () => {
  it('задачи одного ключа идут строго по одной, в порядке прихода', async () => {
    const queue = new KeyedQueue(OPTIONS);
    const gates = [deferred(), deferred(), deferred()];
    const started: number[] = [];

    const running = gates.map((gate, index) =>
      queue.run('order-1', async () => {
        started.push(index);
        await gate.promise;
      }),
    );

    await flush();
    expect(started).toEqual([0]);

    gates[0]!.resolve();
    await running[0];
    await flush();
    expect(started).toEqual([0, 1]);

    gates[1]!.resolve();
    gates[2]!.resolve();
    await Promise.all(running);
    expect(started).toEqual([0, 1, 2]);
  });

  it('разные ключи друг друга не ждут', async () => {
    const queue = new KeyedQueue(OPTIONS);
    const gate = deferred();
    let otherDone = false;

    const blocked = queue.run('order-1', () => gate.promise);
    await queue.run('order-2', async () => {
      otherDone = true;
    });

    expect(otherDone).toBe(true);

    gate.resolve();
    await blocked;
  });

  it('упавшая задача освобождает ключ', async () => {
    const queue = new KeyedQueue(OPTIONS);

    await expect(
      queue.run('order-1', async () => {
        throw new Error('сбой транзакции');
      }),
    ).rejects.toThrow('сбой транзакции');

    await expect(queue.run('order-1', async () => 'дальше')).resolves.toBe('дальше');
  });

  it('сверх длины очереди отказывает сразу, не дожидаясь', async () => {
    const queue = new KeyedQueue(OPTIONS);
    const gate = deferred();

    const running = [
      queue.run('order-1', () => gate.promise),
      queue.run('order-1', async () => undefined),
      queue.run('order-1', async () => undefined),
    ];

    expect(queue.waitingCount('order-1')).toBe(2);

    await expect(queue.run('order-1', async () => undefined)).rejects.toEqual(
      new QueueRejectedError('full'),
    );

    gate.resolve();
    await Promise.all(running);
  });

  it('не дождавшаяся очереди задача не запускается и уходит из очереди', async () => {
    vi.useFakeTimers();

    const queue = new KeyedQueue(OPTIONS);
    const gate = deferred();
    const late = vi.fn(async () => undefined);

    const first = queue.run('order-1', () => gate.promise);
    const second = queue.run('order-1', late);
    const refused = expect(second).rejects.toEqual(new QueueRejectedError('timeout'));

    await vi.advanceTimersByTimeAsync(OPTIONS.maxWaitMs);
    await refused;

    expect(queue.waitingCount('order-1')).toBe(0);

    gate.resolve();
    await first;

    expect(late).not.toHaveBeenCalled();
    // Ключ свободен: следующая задача идёт сразу.
    await expect(queue.run('order-1', async () => 'свободно')).resolves.toBe('свободно');
  });
});

describe('runInOrderQueue', () => {
  it('переполнение очереди заказа отдаёт 503, а не падение', async () => {
    const gate = deferred();
    const orderId = 'order-overloaded';

    const running = [runInOrderQueue(orderId, () => gate.promise)];

    // Полсотни ждущих — предел очереди заказа; следующий получает отказ.
    for (let index = 0; index < 50; index += 1) {
      running.push(runInOrderQueue(orderId, async () => undefined));
    }

    await expect(runInOrderQueue(orderId, async () => undefined)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    gate.resolve();
    await Promise.all(running);
  });

  it('ошибка самой задачи уходит наружу как есть', async () => {
    await expect(
      runInOrderQueue('order-failing', async () => {
        throw new Error('Заказ не найден');
      }),
    ).rejects.toThrow('Заказ не найден');
  });
});
