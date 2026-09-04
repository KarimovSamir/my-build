import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { removeTempFiles } from '../../modules/files/uploaded-file.js';

/**
 * Уборка временных файлов запроса.
 *
 * Multer пишет загруженное на диск, и удалить это обязан тот, кто принял
 * запрос. Делать уборку в теле контроллера нельзя: до него запрос может
 * не дойти — валидация DTO выполняется позже интерсепторов и на неверном
 * поле формы отбивает запрос с уже записанными на диск файлами.
 *
 * Интерсептор ставится **первым**, чтобы обернуть и разбор multipart:
 * `request.files` читается в `finalize`, когда multer его уже заполнил.
 */
@Injectable()
export class TempUploadCleanupInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TempUploadCleanupInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ files?: { path?: string }[] }>();

    return next.handle().pipe(
      finalize(() => {
        const paths = (request.files ?? [])
          .map((file) => file.path)
          .filter((path): path is string => typeof path === 'string');

        void removeTempFiles(paths).catch((error: unknown) => {
          this.logger.error(
            `Не удалось убрать временные файлы запроса: ${String(error)}`,
          );
        });
      }),
    );
  }
}
