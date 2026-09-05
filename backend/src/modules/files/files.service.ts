/**
 * Файлы заказов: загрузка в Supabase Storage, дедупликация, доступ (ТЗ §4.1, §6).
 *
 * Разделение обязанностей: `StorageService` знает только про бакет,
 * `file-validation.ts` — только про содержимое файла, а этот сервис связывает
 * их с базой и правами. Логики статусов заказа здесь нет — она в state-машине.
 */

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  FileOwnerType,
  Role,
  companySeesTaskFiles,
  isExecutorOffer,
  type OrderFileDto,
} from '@mybuild/shared';

import type { OrderFile, Prisma } from '../../generated/prisma/client.js';
import { Semaphore } from '../../common/semaphore.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  buildStorageKey,
  sanitizeFileName,
  type PreparedFile,
  type UploadedFileInput,
} from './file-validation.js';
import { prepareFile, readFileBuffer } from './uploaded-file.js';
import { StorageService } from './storage.service.js';

/**
 * Кто смотрит на файл. Роль нужна ровно для одного правила — «задание клиента
 * открыто компаниям, пока заказ принимает предложения»; всё остальное решает
 * связь с заказом (см. `assertFileAccess`).
 */
export interface FileViewer {
  id: string;
  role: Role | null;
}

/**
 * Сколько файлов процесс отправляет в хранилище одновременно.
 *
 * Тело объекта Supabase принимает буфером, то есть на время загрузки файл
 * лежит в памяти. Ограничитель частоты считает по пользователю и от нескольких
 * параллельных клиентов не спасает, поэтому потолок нужен общий на процесс:
 * четыре слота по 20 МБ — это 80 МБ пика, что переживает и инстанс с 512 МБ.
 */
const MAX_PARALLEL_UPLOADS = 4;

const uploadSlots = new Semaphore(MAX_PARALLEL_UPLOADS);

export interface AttachFilesParams {
  orderId: string;
  ownerType: FileOwnerType;
  /** Номер сдачи: 0 у файлов клиента, у компании — текущая сдача (ТЗ §4.1). */
  submissionRound: number;
  /** Уже проверенные файлы — см. `prepareUploads`. */
  files: PreparedFile[];
  /**
   * Последняя проверка перед вставкой строк, внутри той же транзакции.
   *
   * Нужна, потому что между решением «файлы идут в эту сдачу» и вставкой
   * проходит вся загрузка в хранилище — за это время параллельный запрос может
   * закрыть сдачу, и файлы дописались бы в уже сданный раунд. Исключение
   * из проверки откатывает вставку и убирает загруженные объекты.
   */
  guard?: (tx: Prisma.TransactionClient) => Promise<void>;
}

/**
 * Запасы транзакции вставки: она короткая, но идёт после загрузки в бакет,
 * когда соединение уже могло подтормаживать. Те же числа, что у переходов
 * заказа, — импортировать их из модуля `orders` нельзя, это дало бы цикл.
 */
const ATTACH_TX_OPTIONS = { timeout: 15_000, maxWait: 10_000 } as const;

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Проверить файлы: размер, тип, содержимое и SHA-256.
   *
   * Отдельный шаг, потому что вызывается до того, как в базе появится строка,
   * к которой файлы прикрепляются: отказ по файлу тогда не требует отката.
   * Содержимое читается с диска потоком — в памяти файл целиком не оказывается.
   */
  async prepareUploads(files: UploadedFileInput[]): Promise<PreparedFile[]> {
    if (files.length === 0) {
      throw new BadRequestException('Не приложен ни один файл');
    }

    return Promise.all(files.map(prepareFile));
  }

  /**
   * Сохранить проверенные файлы в бакет и записать в базу.
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

    const fresh = await this.dropDuplicates(orderId, submissionRound, params.files);

    if (fresh.length === 0) {
      return [];
    }

    const keys = fresh.map((file) =>
      buildStorageKey(orderId, ownerType, submissionRound, file),
    );

    let rows: OrderFile[];

    try {
      // Строго по одному: параллельная загрузка держала бы в памяти все файлы
      // запроса разом. Семафор ограничивает уже число запросов, идущих
      // в хранилище одновременно.
      for (const [index, file] of fresh.entries()) {
        // Последовательность здесь — смысл правки, а не недосмотр.
        // oxlint-disable-next-line no-await-in-loop
        await uploadSlots.run(async () =>
          this.storage.upload(keys[index]!, await readFileBuffer(file.path), file.mimeType),
        );
      }

      rows = await this.prisma.$transaction(async (tx) => {
        // Проверка вызывающего кода — под той же транзакцией, что и вставка:
        // отдельным запросом она отвечала бы про состояние, которое к моменту
        // вставки уже устарело.
        await params.guard?.(tx);

        return tx.orderFile.createManyAndReturn({
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
      }, ATTACH_TX_OPTIONS);
    } catch (error) {
      // Загруженное без строки в базе — мусор, который уже никто не найдёт.
      await this.storage.remove(keys);
      throw error;
    }

    // Уборка идёт уже вне `catch`: строки созданы, и с этого момента удалять
    // пачку целиком нельзя — часть ключей принадлежит им. Сбой самой уборки
    // (а она ходит в базу) оставил бы в бакете лишний объект, но не тронул бы
    // объекты живых строк.
    if (rows.length < fresh.length) {
      await this.removeOrphanObjects(orderId, submissionRound, fresh, keys);
    }

    return rows.map(toOrderFileDto);
  }

  /** Ссылка на скачивание. Права на файл проверяет `assertFileAccess` (ТЗ §6). */
  async getDownloadUrl(
    fileId: string,
    viewer: FileViewer,
  ): Promise<{ url: string; originalName: string }> {
    const file = await this.prisma.orderFile.findUnique({
      where: { id: fileId },
      select: { orderId: true, storageKey: true, originalName: true, ownerType: true },
    });

    if (!file) {
      throw new NotFoundException('Файл не найден');
    }

    await this.assertFileAccess(file.orderId, viewer, file.ownerType);

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
   * Право на файл заказа.
   *
   * Клиент заказа и компания-исполнитель видят всё. Кроме них, задание клиента
   * открыто любой компании, пока заказ принимает предложения: по чертежам она
   * и считает цену (`companySeesTaskFiles`). Сдачи компании так не открываются
   * никогда — они остаются сторонам сделки (ТЗ §4.1).
   *
   * Связь с заказом проверяется по идентификатору, а не по роли: роль в токене
   * живёт час и может устареть, связь — нет. Роль всё же нужна в одном месте:
   * «любая компания» — это именно компания, иначе задание одного клиента
   * скачал бы другой.
   */
  async assertFileAccess(
    orderId: string,
    viewer: FileViewer,
    ownerType: FileOwnerType,
  ): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        clientId: true,
        status: true,
        offers: {
          where: { companyId: viewer.id },
          select: { status: true },
          take: 1,
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Заказ не найден');
    }

    if (order.clientId === viewer.id) {
      return;
    }

    const ownOffer = order.offers[0] ?? null;

    const allowed =
      viewer.role === Role.COMPANY &&
      (ownerType === FileOwnerType.CLIENT
        ? companySeesTaskFiles(order.status, ownOffer?.status ?? null)
        : ownOffer !== null && isExecutorOffer(ownOffer.status));

    if (!allowed) {
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
   * Убрать объекты, на которые не сослалась ни одна строка.
   *
   * Часть строк не создалась из-за гонки: `skipDuplicates` пропустил их,
   * потому что параллельный запрос успел записать тот же файл в ту же сдачу.
   * Просто удалить «несохранённые» ключи нельзя — у чужой строки ключ ровно
   * тот же (в нём хеш содержимого), и удаление оставило бы её без объекта.
   * Поэтому спрашиваем базу, какие ключи сейчас в ходу, и убираем остальные:
   * осиротеть может только объект с другим именем файла при том же содержимом.
   */
  private async removeOrphanObjects(
    orderId: string,
    submissionRound: number,
    fresh: PreparedFile[],
    keys: string[],
  ): Promise<void> {
    const inUse = await this.prisma.orderFile.findMany({
      where: {
        orderId,
        submissionRound,
        fileHash: { in: fresh.map((file) => file.fileHash) },
      },
      select: { storageKey: true },
    });

    const live = new Set(inUse.map((row) => row.storageKey));
    await this.storage.remove(keys.filter((key) => !live.has(key)));
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
