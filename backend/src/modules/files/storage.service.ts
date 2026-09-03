import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE_ADMIN } from '../../supabase/supabase.module.js';

/** Сколько живёт ссылка на скачивание. Хватает на клик и не хватает на пересылку. */
export const SIGNED_URL_TTL_SECONDS = 300;

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
      throw new InternalServerErrorException(
        `Не удалось сохранить файл в хранилище: ${error.message}`,
      );
    }
  }

  /**
   * Выпустить ссылку на скачивание.
   * `downloadName` уходит в Content-Disposition — файл сохранится под
   * исходным именем, а не под транслитерированным ключом.
   */
  async createSignedUrl(key: string, downloadName: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(key, SIGNED_URL_TTL_SECONDS, { download: downloadName });

    if (error || !data) {
      throw new InternalServerErrorException(
        `Не удалось выпустить ссылку на файл: ${error?.message ?? 'пустой ответ'}`,
      );
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
