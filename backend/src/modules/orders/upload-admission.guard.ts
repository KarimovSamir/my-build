import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';

import { FileOwnerType } from '@mybuild/shared';

import type { RequestWithOrderAccess } from '../../common/guards/ownership.guard.js';
import { uploadSlots, type UploadSlots } from '../../common/upload-slots.js';
import { FilesService } from '../files/files.service.js';

const UPLOADS_BUSY =
  'Сервер сейчас принимает много файлов. Повторите загрузку через минуту';

/**
 * Последний шаг перед тем, как multer начнёт писать тело запроса на диск.
 *
 * 1. Квота: файлы, которые заведомо не поместятся, отбиваются по объявленной
 *    длине (`FilesService.assertRoomForUpload`), а не после записи на диск
 *    и подсчёта хешей.
 * 2. Место в приёме: запросов с файлами одновременно не больше
 *    `MAX_CONCURRENT_UPLOAD_REQUESTS` на процесс; лишний получает 503
 *    с `Retry-After` (его ставит `AllExceptionsFilter` на любой 503).
 *    Место освобождается, когда закрывается ответ — и при успехе, и при
 *    ошибке, и при оборванном соединении.
 *
 * Ставится последним guard'ом: после `UploadSizeGuard` (длина уже проверена
 * и точно есть) и после `OwnershipGuard` у сдачи работы — квоте нужен заказ,
 * а место в приёме незачем занимать запросу, которому откажут в доступе.
 * Для создания заказа `orderAccess` нет: заказчик — тот, кто создаёт.
 */
@Injectable()
export class UploadAdmissionGuard implements CanActivate {
  /**
   * Места в приёме подменяются только тестами: провайдера `UploadSlots` нет,
   * Nest передаёт `undefined`, и в дело идёт общий на процесс счётчик.
   */
  constructor(
    private readonly files: FilesService,
    @Optional() private readonly slots: UploadSlots = uploadSlots,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithOrderAccess>();
    const response = http.getResponse<Response>();

    if (!request.user) {
      throw new UnauthorizedException('Требуется авторизация');
    }

    const access = request.orderAccess;

    await this.files.assertRoomForUpload({
      orderId: access?.orderId ?? null,
      clientId: access?.clientId ?? request.user.id,
      uploader: access ? FileOwnerType.COMPANY : FileOwnerType.CLIENT,
      // Наличие и формат заголовка проверил `UploadSizeGuard`.
      declaredBytes: Number(request.headers['content-length']),
    });

    const release = this.slots.tryAcquire();

    if (!release) {
      throw new ServiceUnavailableException(UPLOADS_BUSY);
    }

    response.once('close', release);

    return true;
  }
}
