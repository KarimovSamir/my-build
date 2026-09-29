import { describe, expect, it, vi } from 'vitest';

import { applyServerLimits, MAX_CONNECTIONS, UNKNOWN_NAMESPACE } from './server-limits.js';

type Middleware = (socket: unknown, next: (error?: Error) => void) => void;
type ConnectionListener = (connection: { close: () => void }) => void;

function createServer(clientsCount: number) {
  const server = {
    use: vi.fn((_middleware: Middleware) => server),
    engine: {
      clientsCount,
      on: vi.fn((_event: 'connection', _listener: ConnectionListener) => undefined),
    },
  };

  applyServerLimits(server as unknown as Parameters<typeof applyServerLimits>[0]);

  return {
    server,
    middleware: server.use.mock.calls[0]![0],
    onConnection: server.engine.on.mock.calls[0]![1],
  };
}

describe('applyServerLimits', () => {
  it('основной namespace отвергает любое подключение', () => {
    // socket.io заводит его сам и без этого пускал бы туда без токена.
    const { middleware } = createServer(1);
    const next = vi.fn((_error?: Error) => undefined);

    middleware({}, next);

    expect(next.mock.calls[0]![0]?.message).toBe(UNKNOWN_NAMESPACE);
  });

  it('в пределах потолка соединение не трогает', () => {
    const { onConnection } = createServer(MAX_CONNECTIONS);
    const connection = { close: vi.fn() };

    onConnection(connection);

    expect(connection.close).not.toHaveBeenCalled();
  });

  it('сверх потолка закрывает новое соединение сразу', () => {
    const { onConnection } = createServer(MAX_CONNECTIONS + 1);
    const connection = { close: vi.fn() };

    onConnection(connection);

    expect(connection.close).toHaveBeenCalledTimes(1);
  });
});
