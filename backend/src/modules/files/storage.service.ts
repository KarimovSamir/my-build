import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE_ADMIN } from '../../supabase/supabase.module.js';

/** Сколько живёт ссылка на скачивание. Хватает на клик и не хватает на пересылку. */
export const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Объекта нет в бакете.
 *
 * Supabase отвечает на это `StorageApiError` с `code: 'NoSuchKey'`; поле
 * `status` при этом равно 400, а настоящий код лежит в `statusCode` строкой.
 * Смотрим на `code`: он не зависит от того, как обёртка разложит числа.
 */
function isObjectMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'NoSuchKey'
  );
}

/**
 * Тонкая обёртка над Supabase Storage (ТЗ §2, §6).
 *
 * Бакет приватный: ни один объект не доступен по прямой ссылке, наружу уходят
 * только signed URL с коротким сроком жизни, и выпускает их backend после
 * проверки участия в заказе (`FilesService`).
 *
 * Бизнес-правил здесь нет — только доступ к хранилищу и понятные ошибки.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;

  constructor(
    @Inject(SUPABASE_ADMIN) private readonly supabase: SupabaseClient,
    config: ConfigService,
  ) {
    this.bucket = config.getOrThrow<string>('SUPABASE_STORAGE_BUCKET');
  }

  /**
   * Положить объект в бакет.
   *
   * `upsert` включён намеренно: в ключе лежит SHA-256 содержимого, поэтому
   * совпадение ключа означает совпадение байтов. Иначе повторная попытка
   * после неудачной записи в базу падала бы с «объект уже существует».
   */
  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    const { error } = await this.supabase.storage
      .from(this.bucket)
      .upload(key, body, { contentType, upsert: true });

    if (error) {
      // Текст Supabase наружу не уходит: в нём бывает имя бакета и путь объекта.
      // Пользователю от него всё равно нет пользы, а причина нужна владельцу
      // сервиса — она уходит в лог (та же логика, что у `/health`).
      this.logger.error(`Не удалось сохранить объект ${key}: ${error.message}`);

      throw new InternalServerErrorException('Не удалось сохранить файл в хранилище');
    }
  }

  /**
   * Выпустить ссылку на скачивание.
   * `downloadName` уходит в Content-Disposition — файл сохранится под
   * исходным именем, а не под транслитерированным ключом.
   *
   * Пропавший объект — это 404, а не 500: строка в базе есть, а файла за ней
   * нет. Так бывает на seed-данных (они пишутся только в базу) и после сбоя
   * уборки. Отвечать «внутренняя ошибка сервера» на известную причину нельзя —
   * ни пользователю, ни тому, кто потом разбирает логи.
   */
  async createSignedUrl(key: string, downloadName: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(key, SIGNED_URL_TTL_SECONDS, { download: downloadName });

    if (error || !data) {
      const reason = error?.message ?? 'пустой ответ';
      this.logger.error(`Не удалось выпустить ссылку на объект ${key}: ${reason}`);

      if (isObjectMissing(error)) {
        throw new NotFoundException('Файл больше не доступен');
      }

      throw new InternalServerErrorException('Не удалось выпустить ссылку на файл');
    }

    return data.signedUrl;
  }

  /**
   * Удалить объекты. Ошибку не бросает: удаление — это уборка, и она не должна
   * ронять операцию, которая по существу уже прошла. Несделанное видно в логе.
   */
  async remove(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    const { error } = await this.supabase.storage.from(this.bucket).remove(keys);

    if (error) {
      this.logger.error(
        `Не удалось удалить из хранилища ${keys.length} объект(ов): ${error.message}`,
      );
    }
  }
}
