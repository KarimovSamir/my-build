/**
 * Кто делает текущий HTTP-запрос — в терминах WebSocket (ТЗ §8).
 *
 * Зачем это нужно. Все маршруты сделки возвращают свежий `OrderDetail`, и
 * вкладка, которая нажала кнопку, перерисовывается ответом. Но она же состоит
 * в комнате заказа, поэтому получает и собственное событие — и перечитывает
 * заказ ещё раз, уже без всякой пользы. Чтобы этого не было, браузер сообщает
 * идентификатор своего сокета заголовком `X-Socket-Id`, а рассылка этот сокет
 * пропускает. Остальные вкладки того же пользователя событие получают: они
 * ответа не видели.
 *
 * Почему `AsyncLocalStorage`, а не параметр. Рассылку зовут сервисы после
 * коммита, и протаскивать до них признак запроса через каждый метод значило бы
 * поменять подписи всей цепочки ради одного сэкономленного GET.
 *
 * Подделать чужой идентификатор теоретически можно, но он случайный и наружу
 * не отдаётся, а весь эффект подделки — один пропущенный перечит у чужой
 * вкладки, которая всё равно догонит состояние следующим событием.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

/** Заголовок, которым браузер сообщает свой сокет. */
export const SOCKET_ID_HEADER = 'x-socket-id';

interface ActorContext {
  socketId: string | null;
}

const storage = new AsyncLocalStorage<ActorContext>();

/**
 * Сокет автора текущего запроса или `null` — вне запроса, без заголовка
 * и у не-браузерных клиентов.
 */
export function actorSocketId(): string | null {
  return storage.getStore()?.socketId ?? null;
}

/**
 * Middleware, который кладёт автора в контекст на всё время запроса.
 * Ставится в `bootstrap.ts`, то есть и в приложении, и в e2e.
 */
export function actorContextMiddleware(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  storage.run({ socketId: readSocketId(request.headers[SOCKET_ID_HEADER]) }, next);
}

/**
 * Идентификатор сокета из заголовка.
 *
 * Значение приходит от клиента, а уходит в socket.io как имя комнаты —
 * поэтому проверяется формат, а не только тип: у socket.io это короткая
 * строка из букв, цифр, `-` и `_`.
 */
function readSocketId(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null;

  return /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null;
}
