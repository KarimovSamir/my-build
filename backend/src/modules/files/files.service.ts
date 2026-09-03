/**
 * Файлы заказов: загрузка в Supabase Storage, дедупликация, доступ (ТЗ §4.1, §6).
 *
 * Разделение обязанностей: `StorageService` знает только про бакет,
 * `file-validation.ts` — только про содержимое файла, а этот сервис связывает
 * их с базой и правами. Логики статусов заказа здесь нет — она в state-машине.
 */

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EXECUTOR_OFFER_STATUSES,
  FileOwnerType,
  type OrderFileDto,
} from '@mybuild/shared';

import type { OrderFile } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  buildStorageKey,
  prepareFile,
  sanitizeFileName,
  type PreparedFile,
  type UploadedFileInput,
} from './file-validation.js';
import { StorageService } from './storage.service.js';

/**
 * Статусы предложения, при которых компания видит файлы заказа: она его
 * исполнитель. Компания с `SENT`-предложением файлов не видит — она ещё
 * не выбрана (ТЗ §4.1, приватность).
 *
 * Список общий с модулем заказов: два независимых перечня одних и тех же
 * статусов рано или поздно разошлись бы. Он шире, чем `EXECUTING_OFFER_STATUSES`
 * (заказ в работе): доступ к файлам сохраняется и после завершения.
 */
const PARTICIPATING_OFFER_STATUSES = [...EXECUTOR_OFFER_STATUSES];

export interface AttachFilesParams {
  orderId: string;
  ownerType: FileOwnerType;
  /** Номер сдачи: 0 у файлов клиента, у компании — текущая сдача (ТЗ §4.1). */
  submissionRound: number;
  files: UploadedFileInput[];
}

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Проверить, сохранить в бакет и записать в базу.
   *
   * Возвращает только то, что действительно добавилось: дубликаты внутри
   * сдачи молча пропускаются (ТЗ §4.1), и пустой массив — нормальный ответ
   * на повторную загрузку тех же файлов.
   */
  async attachFiles(params: AttachFilesParams): Promise<OrderFileDto[]> {
    const { orderId, ownerType, submissionRound } = params;

    if (params.files.length === 0) {
      throw new BadRequestException('Не приложен ни один файл');
    }

    const prepared = params.files.map(prepareFile);
    const fresh = await this.dropDuplicates(orderId, submissionRound, prepared);

    if (fresh.length === 0) {
      return [];
    }

    const keys = fresh.map((file) =>
      buildStorageKey(orderId, ownerType, submissionRound, file),
    );

    try {
      await Promise.all(
        fresh.map((file, index) =>
          this.storage.upload(keys[index]!, file.buffer, file.mimeType),
        ),
      );

      const rows = await this.prisma.orderFile.createManyAndReturn({
        data: fresh.map((file, index) => ({
          orderId,
          storageKey: keys[index]!,
          ownerType,
          submissionRound,
          fileHash: file.fileHash,
          originalName: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
        })),
        // Между проверкой дублей и вставкой мог успеть пройти другой запрос
        // с тем же файлом. Ограничение в базе это ловит; падать из-за гонки
        // на загрузке файлов незачем.
        skipDuplicates: true,
      });

      // Объекты, чьи строки не создались из-за той самой гонки, в бакете
      // не нужны: на них никто не сошлётся.
      const saved = new Set(rows.map((row) => row.storageKey));
      await this.storage.remove(keys.filter((key) => !saved.has(key)));

      return rows.map(toOrderFileDto);
    } catch (error) {
      // Загруженное без строки в базе — мусор, который уже никто не найдёт.
      await this.storage.remove(keys);
      throw error;
    }
  }

  /** Ссылка на скачивание. Доступна только участникам заказа (ТЗ §6). */
  async getDownloadUrl(
    fileId: string,
    userId: string,
  ): Promise<{ url: string; originalName: string }> {
    const file = await this.prisma.orderFile.findUnique({
      where: { id: fileId },
      select: { orderId: true, storageKey: true, originalName: true },
    });

    if (!file) {
      throw new NotFoundException('Файл не найден');
    }

    await this.assertOrderParticipant(file.orderId, userId);

    return {
      url: await this.storage.createSignedUrl(
        file.storageKey,
        toDownloadName(file.originalName),
      ),
      originalName: file.originalName,
    };
  }

  /** Файлы заказа. Порядок — от старой сдачи к новой, внутри сдачи по времени. */
  async listOrderFiles(orderId: string): Promise<OrderFileDto[]> {
    const files = await this.prisma.orderFile.findMany({
      where: { orderId },
      orderBy: [{ submissionRound: 'asc' }, { createdAt: 'asc' }],
    });

    return files.map(toOrderFileDto);
  }

  /**
   * Участник заказа — его клиент либо компания, чьё предложение принято.
   * Проверка по идентификатору, а не по роли: роль в токене может устареть,
   * а связь с заказом — нет.
   */
  async assertOrderParticipant(orderId: string, userId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        clientId: true,
        offers: {
          where: { companyId: userId, status: { in: PARTICIPATING_OFFER_STATUSES } },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Заказ не найден');
    }

    if (order.clientId !== userId && order.offers.length === 0) {
      throw new ForbiddenException('Нет доступа к файлам этого заказа');
    }
  }

  /**
   * Ключи объектов заказа в хранилище.
   *
   * Читаются до удаления заказа: строки `OrderFile` уходят каскадом,
   * и после этого узнать, что убирать из бакета, уже неоткуда.
   */
  async listStorageKeys(orderId: string): Promise<string[]> {
    const files = await this.prisma.orderFile.findMany({
      where: { orderId },
      select: { storageKey: true },
    });

    return files.map((file) => file.storageKey);
  }

  /** Убрать объекты из бакета. Ошибку не бросает: уборка не должна ронять операцию. */
  removeStorageObjects(storageKeys: string[]): Promise<void> {
    return this.storage.remove(storageKeys);
  }

  /**
   * Убрать из бакета всё, что относится к заказу, пока его строки ещё на месте.
   * Для случаев, когда сам заказ не удаляется, — например, уборка за тестом.
   */
  async removeStorageObjectsForOrder(orderId: string): Promise<void> {
    await this.storage.remove(await this.listStorageKeys(orderId));
  }

  /**
   * Отсеять то, что в этой сдаче уже есть: и повторы внутри пачки,
   * и файлы, загруженные раньше. Дедупликация действует в пределах одной
   * сдачи — тот же файл в следующей сдаче это новая версия (ТЗ §4.1).
   */
  private async dropDuplicates(
    orderId: string,
    submissionRound: number,
    prepared: PreparedFile[],
  ): Promise<PreparedFile[]> {
    // Из одинаковых файлов остаётся первый: пользователь видит именно то имя,
    // под которым приложил файл, а не имя последней копии.
    const seen = new Set<string>();
    const uniqueInBatch = prepared.filter((file) => {
      if (seen.has(file.fileHash)) return false;
      seen.add(file.fileHash);
      return true;
    });

    const existing = await this.prisma.orderFile.findMany({
      where: {
        orderId,
        submissionRound,
        fileHash: { in: uniqueInBatch.map((file) => file.fileHash) },
      },
      select: { fileHash: true },
    });

    const known = new Set(existing.map((file) => file.fileHash));
    return uniqueInBatch.filter((file) => !known.has(file.fileHash));
  }
}

/** Имя латиницей и цифрами — такое Supabase Storage отдаёт без искажений. */
const ASCII_PRINTABLE = /^[\x20-\x7E]+$/;

/**
 * Имя, под которым файл сохранится у пользователя.
 *
 * Supabase не декодирует параметр `download`, а Content-Disposition собирает
 * из него как есть, — кириллическое имя доезжает percent-кодированным дважды
 * и сохраняется как «%D0%9B%D0%BE…». Поэтому не-ASCII имена уходят
 * транслитерированными; настоящее имя пользователь видит в интерфейсе,
 * оно лежит в `OrderFile.originalName`.
 */
function toDownloadName(originalName: string): string {
  return ASCII_PRINTABLE.test(originalName) ? originalName : sanitizeFileName(originalName);
}

/** Строка базы → контракт API. `storageKey` наружу не уходит. */
function toOrderFileDto(file: OrderFile): OrderFileDto {
  return {
    id: file.id,
    orderId: file.orderId,
    ownerType: file.ownerType,
    submissionRound: file.submissionRound,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    createdAt: file.createdAt.toISOString(),
  };
}
