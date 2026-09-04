/**
 * Ограничитель числа одновременно выполняемых задач.
 *
 * Нужен там, где каждая задача занимает заметную память: загрузка файла
 * держит его содержимое в буфере, и без потолка десять параллельных запросов
 * складываются в сотни мегабайт (см. `FilesService`).
 *
 * Лишние задачи не отбрасываются, а ждут очереди: отказывать пользователю
 * из-за того, что рядом кто-то грузит файл, незачем — ограничение частоты
 * запросов живёт отдельно.
 */
export class Semaphore {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {
    if (limit < 1) {
      throw new RangeError('Semaphore: предел должен быть не меньше 1');
    }
  }

  /** Выполнить задачу, дождавшись свободного места. */
  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();

    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.waiting.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.active -= 1;
    this.waiting.shift()?.();
  }
}
