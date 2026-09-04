import { describe, expect, it } from 'vitest';

import { Semaphore } from './semaphore.js';

/** Задача, которую тест завершает вручную. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

describe('Semaphore', () => {
  it('не запускает больше задач, чем разрешено', async () => {
    const semaphore = new Semaphore(2);
    const gates = [deferred(), deferred(), deferred()];
    let started = 0;

    const running = gates.map((gate) =>
      semaphore.run(async () => {
        started += 1;
        await gate.promise;
      }),
    );

    // Дать очереди микрозадач разойтись: третья задача не должна начаться.
    await Promise.resolve();
    expect(started).toBe(2);

    gates[0]!.resolve();
    await running[0];
    expect(started).toBe(3);

    gates[1]!.resolve();
    gates[2]!.resolve();
    await Promise.all(running);
  });

  it('освобождает место, даже если задача упала', async () => {
    const semaphore = new Semaphore(1);

    await expect(
      semaphore.run(() => Promise.reject(new Error('сбой хранилища'))),
    ).rejects.toThrow('сбой хранилища');

    await expect(semaphore.run(async () => 'следующая')).resolves.toBe('следующая');
  });

  it('возвращает результат задачи', async () => {
    await expect(new Semaphore(1).run(async () => 42)).resolves.toBe(42);
  });

  it('не создаётся с нулевым пределом', () => {
    expect(() => new Semaphore(0)).toThrow(RangeError);
  });
});
