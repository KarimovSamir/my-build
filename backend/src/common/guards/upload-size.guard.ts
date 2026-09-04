import {
  CanActivate,
  ExecutionContext,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Request } from 'express';

import { MAX_UPLOAD_REQUEST_BYTES } from '@mybuild/shared';

/**
 * Потолок на размер запроса с файлами (ТЗ §6).
 *
 * Лимиты multer действуют на отдельный файл и на их количество, но не на
 * запрос целиком. Guard'ы выполняются раньше интерсепторов, поэтому проверка
 * по `Content-Length` отсекает заведомо неподъёмный запрос до того, как multer
 * начнёт принимать тело.
 *
 * Заголовка может не быть (chunked-передача) — тогда пропускаем: за таким
 * запросом всё равно следят лимиты multer на файл и на их число.
 */
@Injectable()
export class UploadSizeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const declared = Number(request.headers['content-length']);

    if (Number.isFinite(declared) && declared > MAX_UPLOAD_REQUEST_BYTES) {
      throw new PayloadTooLargeException(
        `Запрос больше ${Math.floor(MAX_UPLOAD_REQUEST_BYTES / 1024 / 1024)} МБ. Приложите файлы меньшего размера`,
      );
    }

    return true;
  }
}
