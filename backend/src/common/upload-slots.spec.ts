import { describe, expect, it } from 'vitest';

import { UploadSlots } from './upload-slots.js';

describe('UploadSlots', () => {
  it('сверх предела отказывает сразу, а не ставит в очередь', () => {
    const slots = new UploadSlots(2);

    expect(slots.tryAcquire()).not.toBeNull();
    expect(slots.tryAcquire()).not.toBeNull();
    expect(slots.tryAcquire()).toBeNull();
    expect(slots.inUse).toBe(2);
  });

  it('освобождённое место снова доступно', () => {
    const slots = new UploadSlots(1);
    const release = slots.tryAcquire()!;

    release();

    expect(slots.inUse).toBe(0);
    expect(slots.tryAcquire()).not.toBeNull();
  });

  it('повторное освобождение не отдаёт чужое место', () => {
    // Освобождение висит на закрытии ответа, а оно может прийти не один раз.
    const slots = new UploadSlots(2);
    const release = slots.tryAcquire()!;
    slots.tryAcquire();

    release();
    release();

    expect(slots.inUse).toBe(1);
  });

  it('предел меньше единицы — ошибка конфигурации', () => {
    expect(() => new UploadSlots(0)).toThrow(RangeError);
  });
});
