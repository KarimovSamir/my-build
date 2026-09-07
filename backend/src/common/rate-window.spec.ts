import { describe, expect, it } from 'vitest';

import { RateWindows } from './rate-window.js';

/**
 * Скользящее окно само по себе. Через `ThrottleGuard` оно проверено на HTTP,
 * здесь — свойства, которыми пользуется шлюз: отказ не продлевает окно,
 * ключи не смешиваются, отключившийся сокет забывается.
 */

const OPTIONS = { limit: 2, ttl: 1_000 };

describe('RateWindows', () => {
  it('пропускает до лимита и отказывает следующему', () => {
    const windows = new RateWindows();

    expect(windows.hit('a', OPTIONS, 0).allowed).toBe(true);
    expect(windows.hit('a', OPTIONS, 100).allowed).toBe(true);

    const denied = windows.hit('a', OPTIONS, 200);

    expect(denied.allowed).toBe(false);
    // Окно освободится, когда из него выпадет самое старое обращение.
    expect(denied.retryAfterMs).toBe(800);
  });

  it('отказ не продлевает окно — иначе поток запросов запирал бы сам себя', () => {
    const windows = new RateWindows();

    windows.hit('a', OPTIONS, 0);
    windows.hit('a', OPTIONS, 0);
    windows.hit('a', OPTIONS, 500);

    // Первое обращение выпало из окна ровно в срок, отказ на 500 его не сдвинул.
    expect(windows.hit('a', OPTIONS, 1_001).allowed).toBe(true);
  });

  it('ключи считаются раздельно', () => {
    const windows = new RateWindows();

    windows.hit('a', OPTIONS, 0);
    windows.hit('a', OPTIONS, 0);

    expect(windows.hit('a', OPTIONS, 0).allowed).toBe(false);
    expect(windows.hit('b', OPTIONS, 0).allowed).toBe(true);
  });

  it('забывает ключ вместе с его подключами', () => {
    const windows = new RateWindows();

    windows.hit('socket-1:subscribe:order', OPTIONS, 0);
    windows.hit('socket-1:subscribe:order', OPTIONS, 0);
    windows.hit('socket-2:subscribe:order', OPTIONS, 0);

    windows.forget('socket-1');

    // Идентификатор отключившегося сокета больше не повторится, а окно соседа
    // трогать нельзя.
    expect(windows.hit('socket-1:subscribe:order', OPTIONS, 0).allowed).toBe(true);
    expect(windows.hit('socket-2:subscribe:order', OPTIONS, 0).allowed).toBe(true);
    expect(windows.hit('socket-2:subscribe:order', OPTIONS, 0).allowed).toBe(false);
  });
});
