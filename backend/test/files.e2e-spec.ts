import 'dotenv/config';

import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { FileOwnerType, OfferStatus, OrderStatus, Role } from '@mybuild/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateEnv } from '../src/config/env.validation.js';
import { ObjectType, OrderCategory } from '../src/generated/prisma/client.js';
import { FilesModule } from '../src/modules/files/files.module.js';
import { FilesService } from '../src/modules/files/files.service.js';
import { StorageService } from '../src/modules/files/storage.service.js';
import { prepareFile } from '../src/modules/files/uploaded-file.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { e2eSuite } from './support/e2e-users.js';

/** Свой набор пользователей: уборка не заденет фикстуры соседних файлов. */
const users = e2eSuite('files');
import { pdfBytes, pngBytes, removeWrittenUploads, writeUpload } from './support/uploads.js';

/**
 * Проверяет модуль файлов на живом Supabase: объект действительно попадает
 * в приватный бакет, строка OrderFile создаётся, signed URL отдаёт ровно те
 * байты, что загрузили, а посторонний ссылку не получает (DoD подфазы 3.1).
 *
 * Правила дедупликации и доступа покрыты unit-тестами без сети
 * (`src/modules/files/files.service.spec.ts`). Здесь важна реальная запись.
 *
 * Бакет должен существовать: `npm run storage:setup -w backend`.
 */
function upload(originalName: string, mimeType: string, content: Buffer) {
  return prepareFile(writeUpload(originalName, mimeType, content));
}

describe('FilesService (e2e)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let files: FilesService;
  let storage: StorageService;

  let clientId: string;
  let executorId: string;
  let outsiderId: string;
  let orderId: string;

  const planContent = pdfBytes('план квартиры, версия клиента');
  const photoContent = pngBytes('фото объекта');

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'], validate: validateEnv }),
        PrismaModule,
        FilesModule,
      ],
    }).compile();

    await moduleRef.init();

    prisma = moduleRef.get(PrismaService);
    files = moduleRef.get(FilesService);
    storage = moduleRef.get(StorageService);

    await users.dropUsers();

    clientId = (await users.createUser('files-client', { role: Role.CLIENT })).id;
    executorId = (
      await users.createUser('files-executor', {
        role: Role.COMPANY,
        companyName: 'ООО «Исполнитель»',
      })
    ).id;
    outsiderId = (
      await users.createUser('files-outsider', {
        role: Role.COMPANY,
        companyName: 'ООО «Посторонняя»',
      })
    ).id;

    const order = await prisma.order.create({
      data: {
        clientId,
        title: 'Заказ с файлами',
        category: OrderCategory.PLAN_CREATION,
        objectType: ObjectType.APARTMENT,
        description: 'Проверка загрузки файлов',
        address: 'Москва, ул. Тестовая, 2',
        squareMeters: 42,
        offers: {
          create: [
            {
              companyId: executorId,
              status: OfferStatus.ACCEPTED,
              proposedPrice: '5000.00',
              proposedDeadline: new Date('2027-01-01T00:00:00.000Z'),
            },
            {
              // Предложение подано, но не принято: доступа к файлам не даёт.
              companyId: outsiderId,
              status: OfferStatus.SENT,
              proposedPrice: '7000.00',
              proposedDeadline: new Date('2027-02-01T00:00:00.000Z'),
            },
          ],
        },
      },
    });

    orderId = order.id;
  });

  afterAll(async () => {
    // Каскад удаляет строки OrderFile, но не объекты в бакете — их убираем сами.
    if (orderId) await files.removeStorageObjectsForOrder(orderId);
    await users.dropUsers();
    await moduleRef?.close();
    removeWrittenUploads();
  });

  it('сохраняет файлы клиента, отбрасывая повтор внутри сдачи', async () => {
    const saved = await files.attachFiles({
      orderId,
      ownerType: FileOwnerType.CLIENT,
      submissionRound: 0,
      files: [
        await upload('План квартиры.pdf', 'application/pdf', planContent),
        // То же содержимое под другим именем — в базу попасть не должно.
        await upload('копия плана.pdf', 'application/pdf', planContent),
        await upload('Фото.png', 'image/png', photoContent),
      ],
    });

    expect(saved).toHaveLength(2);
    expect(saved.map((file) => file.originalName)).toEqual([
      'План квартиры.pdf',
      'Фото.png',
    ]);

    const rows = await prisma.orderFile.findMany({ where: { orderId } });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.ownerType === FileOwnerType.CLIENT)).toBe(true);
    expect(rows.every((row) => row.submissionRound === 0)).toBe(true);
    expect(rows.map((row) => row.storageKey).every((key) => key.startsWith(`orders/${orderId}/client/0/`))).toBe(true);
  });

  it('повторная загрузка того же файла ничего не добавляет', async () => {
    const saved = await files.attachFiles({
      orderId,
      ownerType: FileOwnerType.CLIENT,
      submissionRound: 0,
      files: [await upload('План квартиры.pdf', 'application/pdf', planContent)],
    });

    expect(saved).toEqual([]);
    expect(await prisma.orderFile.count({ where: { orderId } })).toBe(2);
  });

  it('тот же файл в новой сдаче компании сохраняется заново', async () => {
    const saved = await files.attachFiles({
      orderId,
      ownerType: FileOwnerType.COMPANY,
      submissionRound: 1,
      files: [await upload('План квартиры.pdf', 'application/pdf', planContent)],
    });

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      ownerType: FileOwnerType.COMPANY,
      submissionRound: 1,
    });
    expect(await prisma.orderFile.count({ where: { orderId } })).toBe(3);
  });

  it('signed URL клиента отдаёт ровно то, что загрузили', async () => {
    const file = await prisma.orderFile.findFirstOrThrow({
      where: { orderId, originalName: 'План квартиры.pdf', submissionRound: 0 },
    });

    const { url, originalName } = await files.getDownloadUrl(file.id, {
      id: clientId,
      role: Role.CLIENT,
    });
    expect(originalName).toBe('План квартиры.pdf');

    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(planContent)).toBe(true);

    // Кириллица в Content-Disposition Supabase ломает, поэтому файл
    // сохраняется под транслитерированным именем (см. toDownloadName).
    expect(response.headers.get('content-disposition')).toContain('plan-kvartiry.pdf');
  });

  it('прямая ссылка на объект без подписи не работает: бакет приватный', async () => {
    const file = await prisma.orderFile.findFirstOrThrow({ where: { orderId } });
    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/${process.env.SUPABASE_STORAGE_BUCKET ?? 'order-files'}/${file.storageKey}`;

    const response = await fetch(publicUrl);
    expect(response.ok).toBe(false);
  });

  it('исполнитель получает всё, посторонняя компания — только задание клиента', async () => {
    const executor = { id: executorId, role: Role.COMPANY };
    const outsider = { id: outsiderId, role: Role.COMPANY };

    const task = await prisma.orderFile.findFirstOrThrow({
      where: { orderId, ownerType: FileOwnerType.CLIENT },
    });
    const submission = await prisma.orderFile.findFirstOrThrow({
      where: { orderId, ownerType: FileOwnerType.COMPANY },
    });

    await expect(files.getDownloadUrl(task.id, executor)).resolves.toMatchObject({
      url: expect.stringContaining('token='),
    });

    // Заказ ещё ищет исполнителя: задание открыто любой компании — по нему
    // она и считает цену (решение пользователя от 5 сентября 2026).
    await expect(files.getDownloadUrl(task.id, outsider)).resolves.toMatchObject({
      url: expect.stringContaining('token='),
    });

    // А сдачи исполнителя не открываются так никогда (ТЗ §4.1).
    await expect(files.getDownloadUrl(submission.id, outsider)).rejects.toMatchObject({
      status: 403,
    });

    // Как только заказ ушёл в работу, задание для посторонней закрывается.
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.IN_PROGRESS },
    });

    await expect(files.getDownloadUrl(task.id, outsider)).rejects.toMatchObject({
      status: 403,
    });

    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.WAITING },
    });
  });

  it('задание одного клиента другому клиенту не отдаётся', async () => {
    // Правило «задание открыто, пока заказ ищет исполнителя» — про компании.
    // Без проверки роли по нему прошёл бы любой посторонний пользователь.
    const task = await prisma.orderFile.findFirstOrThrow({
      where: { orderId, ownerType: FileOwnerType.CLIENT },
    });

    await expect(
      files.getDownloadUrl(task.id, { id: outsiderId, role: Role.CLIENT }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('несуществующий файл — 404', async () => {
    await expect(
      files.getDownloadUrl('00000000-0000-0000-0000-000000000000', {
        id: clientId,
        role: Role.CLIENT,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('файл с недопустимым типом до хранилища не доходит', async () => {
    await expect(
      files.prepareUploads([
        writeUpload('смета.xlsx', 'application/vnd.ms-excel', Buffer.from('x')),
      ]),
    ).rejects.toMatchObject({ status: 400 });

    expect(await prisma.orderFile.count({ where: { orderId } })).toBe(3);
  });

  it('файл с чужим содержимым под видом PDF до хранилища не доходит', async () => {
    await expect(
      files.prepareUploads([
        writeUpload('обманка.pdf', 'application/pdf', Buffer.from('MZ исполняемый')),
      ]),
    ).rejects.toMatchObject({ status: 400 });

    expect(await prisma.orderFile.count({ where: { orderId } })).toBe(3);
  });

  it('уборка за заказом убирает объекты из бакета', async () => {
    const file = await prisma.orderFile.findFirstOrThrow({ where: { orderId } });
    const url = await storage.createSignedUrl(file.storageKey, file.originalName);

    await files.removeStorageObjectsForOrder(orderId);

    // Подпись ещё действует, но объекта за ней уже нет.
    const response = await fetch(url);
    expect(response.ok).toBe(false);
  });
});
