import { describe, expect, it } from 'vitest';

import { addUsage, StorageReservations } from './file-quota.js';

describe('StorageReservations', () => {
  it('считает обещанное по заказу, заказчику и сервису', () => {
    const reservations = new StorageReservations();

    reservations.reserve('order-1', 'client-1', 10);
    reservations.reserve('order-2', 'client-1', 5);
    reservations.reserve('order-3', 'client-2', 7);

    expect(reservations.pending('order-1', 'client-1')).toEqual({
      order: 10,
      client: 15,
      total: 22,
    });
    expect(reservations.pending('order-3', 'client-2')).toEqual({
      order: 7,
      client: 7,
      total: 22,
    });
  });

  it('освобождение возвращает место, и повторное ничего не ломает', () => {
    const reservations = new StorageReservations();
    const release = reservations.reserve('order-1', 'client-1', 10);

    release();
    release();

    expect(reservations.pending('order-1', 'client-1')).toEqual({
      order: 0,
      client: 0,
      total: 0,
    });
  });
});

describe('addUsage', () => {
  it('складывает по всем трём границам', () => {
    expect(
      addUsage({ order: 1, client: 2, total: 3 }, { order: 10, client: 20, total: 30 }),
    ).toEqual({ order: 11, client: 22, total: 33 });
  });
});
