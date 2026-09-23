import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Request } from 'express';

import { MAX_UPLOAD_REQUEST_BYTES } from '@mybuild/shared';

/** Только цифры: `Number('')` и `Number(' 1e3 ')` тоже дают число. */
const DECIMAL_LENGTH = /^\d+$/;

/**
 * Потолок на размер запроса с файлами (ТЗ §6).
 *
 * Лимиты multer действуют на отдельный файл, на число файлов и полей, но не
 * на запрос целиком. Guard'ы выполняются раньше интерсепторов, поэтому проверка
 * по `Content-Length` отсекает заведомо неподъёмный запрос до того, как multer
 * начнёт принимать тело.
 *
 * Запрос без `Content-Length` (chunked-передача) не принимается вовсе: только
 * заголовок делает потолок настоящим — дальше объявленной длины Node тело
 * не читает. Браузер отправляет `FormData` с длиной всегда, так что отказ
 * задевает лишь самодельных клиентов.
 */
@Injectable()
export class UploadSizeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['content-length'];

    if (header === undefined || !DECIMAL_LENGTH.test(header)) {
      throw new HttpException(
        'Запрос с файлами должен объявлять размер (Content-Length)',
        HttpStatus.LENGTH_REQUIRED,
      );
    }

    if (Number(header) > MAX_UPLOAD_REQUEST_BYTES) {
      throw new PayloadTooLargeException(
        `Запрос больше ${Math.floor(MAX_UPLOAD_REQUEST_BYTES / 1024 / 1024)} МБ. Приложите файлы меньшего размера`,
      );
    }

    return true;
  }
}
