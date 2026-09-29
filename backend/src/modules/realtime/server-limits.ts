/**
 * Пределы сервера socket.io — то, что `OrderGateway` не видит со своего
 * namespace'а.
 *
 * Авторизация шлюза стоит на `/ws`, но socket.io заводит ещё и основной
 * namespace `/` — сам, без спроса, — и пускает туда кого угодно: анонимное
 * соединение держалось бы там сколько угодно. Тысячи таких с одного адреса
 * выбирают память единственного инстанса (Render Free, 512 МБ, примерно
 * 14 КБ на соединение).
 *
 * Поэтому:
 * - основной namespace отвергает всех — ходить туда нашему клиенту незачем;
 * - соединение, которое не вошло ни в один namespace, сервер закрывает через
 *   `CONNECT_TIMEOUT_MS` (опция `connectTimeout` в декораторе шлюза): так
 *   живут и отвергнутые, и не прошедшие авторизацию `/ws`;
 * - всего соединений на процесс не больше `MAX_CONNECTIONS` — последний рубеж
 *   для памяти, когда соединения всё же авторизованы (демо-учётка открыта всем).
 *
 * Потолка «на адрес» нет намеренно: какой адрес доходит до процесса через
 * прокси площадки, отсюда не проверить, и если это адрес прокси, потолок
 * отрезал бы настоящих посетителей целыми городами.
 */

import type { Server } from 'socket.io';

/** Сколько соединение может жить, не войдя ни в один namespace. */
export const CONNECT_TIMEOUT_MS = 10_000;

/**
 * Сколько соединений держит процесс. ~70 МБ по замеру аудита — с запасом
 * до потолка инстанса, и на порядки больше, чем бывает живых вкладок.
 */
export const MAX_CONNECTIONS = 5_000;

export const UNKNOWN_NAMESPACE = 'Неизвестный адрес подключения';

/** Соединение engine.io — ровно то, что здесь нужно. */
interface EngineConnection {
  close(): void;
}

interface EngineLike {
  clientsCount: number;
  on(event: 'connection', listener: (connection: EngineConnection) => void): unknown;
}

export interface LimitableServer {
  use: Server['use'];
  engine: EngineLike;
}

export function applyServerLimits(server: LimitableServer): void {
  server.use((_socket, next) => next(new Error(UNKNOWN_NAMESPACE)));

  // Счётчик к этому моменту уже включает новое соединение.
  server.engine.on('connection', (connection) => {
    if (server.engine.clientsCount > MAX_CONNECTIONS) {
      connection.close();
    }
  });
}
