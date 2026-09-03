/**
 * Тестовые данные для разработки: один клиент, три компании и по заказу
 * в каждом статусе state-машины (ТЗ §10, Фаза 1).
 *
 * Запуск: `npm run db:seed`.
 *
 * Скрипт идемпотентен: сначала удаляет своих пользователей по фиксированным
 * id, а вместе с ними каскадом уходят их заказы, предложения, файлы и
 * уведомления. Чужие данные не трогает.
 *
 * Два ограничения, о которых стоит помнить:
 * — Файлы существуют только строками в БД; в бакете Supabase Storage их нет,
 *   поэтому скачивание по signed URL на них не сработает.
 * — Пользователи создаются напрямую в public.User. В Фазе 2 появится внешний
 *   ключ на auth.users, и скрипт придётся переписать на создание учётных
 *   записей через Admin API.
 */

import 'dotenv/config';
import { createHash } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { formatOrderNumber } from '@mybuild/shared';

import {
  FileOwnerType,
  NotificationType,
  ObjectType,
  OfferStatus,
  OrderCategory,
  OrderStatus,
  PrismaClient,
  Role,
} from '../src/generated/prisma/client.js';

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'Не задана строка подключения: заполни DIRECT_URL в backend/.env ' +
      '(шаблон — backend/env.example)',
  );
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Фиксированные id — чтобы повторный запуск заменял те же данные,
// а не плодил новые.
const CLIENT_ID = '00000000-0000-4000-8000-000000000001';
const COMPANY_STROYGRAD = '00000000-0000-4000-8000-000000000002';
const COMPANY_REMONT = '00000000-0000-4000-8000-000000000003';
const COMPANY_ARCH = '00000000-0000-4000-8000-000000000004';

const SEED_USER_IDS = [
  CLIENT_ID,
  COMPANY_STROYGRAD,
  COMPANY_REMONT,
  COMPANY_ARCH,
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Дата со сдвигом в днях от текущего момента: сроки должны выглядеть живыми. */
function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY_MS);
}

/** Хеш содержимого файла. Настоящих файлов нет — считаем от имени. */
function fakeHash(name: string): string {
  return createHash('sha256').update(name).digest('hex');
}

interface SeedFile {
  name: string;
  mimeType: string;
  sizeBytes: number;
  ownerType: FileOwnerType;
  submissionRound: number;
}

function clientFile(name: string, mimeType: string, sizeBytes: number): SeedFile {
  return {
    name,
    mimeType,
    sizeBytes,
    ownerType: FileOwnerType.CLIENT,
    submissionRound: 0,
  };
}

function companyFile(
  name: string,
  mimeType: string,
  sizeBytes: number,
  submissionRound: number,
): SeedFile {
  return {
    name,
    mimeType,
    sizeBytes,
    ownerType: FileOwnerType.COMPANY,
    submissionRound,
  };
}

async function seedUsers(): Promise<void> {
  await prisma.user.createMany({
    data: [
      {
        id: CLIENT_ID,
        email: 'anna.client@mybuild.test',
        role: Role.CLIENT,
        firstName: 'Анна',
        lastName: 'Смирнова',
        phone: '+7 900 100-10-01',
        city: 'Москва',
        country: 'Россия',
      },
      {
        id: COMPANY_STROYGRAD,
        email: 'info@stroygrad.mybuild.test',
        role: Role.COMPANY,
        firstName: 'Иван',
        lastName: 'Петров',
        phone: '+7 900 200-20-02',
        companyName: 'ООО «СтройГрад»',
        city: 'Москва',
        country: 'Россия',
      },
      {
        id: COMPANY_REMONT,
        email: 'info@remontplus.mybuild.test',
        role: Role.COMPANY,
        firstName: 'Пётр',
        lastName: 'Козлов',
        phone: '+7 900 300-30-03',
        companyName: 'ООО «Ремонт Плюс»',
        city: 'Санкт-Петербург',
        country: 'Россия',
      },
      {
        id: COMPANY_ARCH,
        email: 'info@archproject.mybuild.test',
        role: Role.COMPANY,
        firstName: 'Ольга',
        lastName: 'Новикова',
        phone: '+7 900 400-40-04',
        companyName: 'ООО «АрхПроект»',
        city: 'Казань',
        country: 'Россия',
      },
    ],
  });
}

interface SeedOrder {
  title: string;
  category: OrderCategory;
  objectType: ObjectType;
  description: string;
  address: string;
  squareMeters: number;
  verifiedSquareMeters?: number;
  clientBudget?: string;
  desiredStartDate?: Date;
  price?: string;
  deadline?: Date;
  status: OrderStatus;
  clientCompletionComment?: string;
  correctionComment?: string;
  files: SeedFile[];
  offers: {
    companyId: string;
    status: OfferStatus;
    proposedPrice: string;
    proposedDeadline: Date;
    comment?: string;
  }[];
}

/** По одному заказу на каждый статус — чтобы экраны было чем наполнить. */
const orders: SeedOrder[] = [
  {
    title: 'Ремонт квартиры 100 м²',
    category: OrderCategory.PLAN_IMPLEMENTATION,
    objectType: ObjectType.APARTMENT,
    description:
      'Полный ремонт двухкомнатной квартиры: демонтаж, электрика, ' +
      'выравнивание стен, чистовая отделка. Материалы за счёт заказчика.',
    address: 'Москва, ул. Профсоюзная, 45, кв. 12',
    squareMeters: 100,
    clientBudget: '18000.00',
    desiredStartDate: daysFromNow(14),
    status: OrderStatus.WAITING,
    files: [clientFile('Планировка квартиры.pdf', 'application/pdf', 842_113)],
    offers: [],
  },
  {
    title: 'Отделка офиса открытого типа',
    category: OrderCategory.PLAN_IMPLEMENTATION,
    objectType: ObjectType.COMMERCIAL,
    description:
      'Отделка офисного помещения на 40 рабочих мест: перегородки, ' +
      'подвесной потолок, освещение, напольное покрытие.',
    address: 'Москва, Пресненская наб., 12, этаж 8',
    squareMeters: 320,
    clientBudget: '52000.00',
    desiredStartDate: daysFromNow(30),
    status: OrderStatus.AWAITING_CONFIRMATION,
    files: [
      clientFile('Обмерный план офиса.pdf', 'application/pdf', 1_204_882),
      clientFile('Референсы интерьера.png', 'image/png', 2_931_004),
    ],
    offers: [
      {
        companyId: COMPANY_STROYGRAD,
        status: OfferStatus.SENT,
        proposedPrice: '49500.00',
        proposedDeadline: daysFromNow(75),
        comment: 'Своя бригада, работаем без выходных. Гарантия 2 года.',
      },
      {
        companyId: COMPANY_REMONT,
        status: OfferStatus.SENT,
        proposedPrice: '56000.00',
        proposedDeadline: daysFromNow(60),
        comment: 'Срок короче за счёт двух смен. Материалы закупаем сами.',
      },
      {
        // Отозванное предложение: заказ должен снова быть виден этой компании
        // в ленте доступных (ТЗ §4.1).
        companyId: COMPANY_ARCH,
        status: OfferStatus.WITHDRAWN,
        proposedPrice: '61000.00',
        proposedDeadline: daysFromNow(90),
      },
    ],
  },
  {
    title: 'Строительство частного дома',
    category: OrderCategory.PLAN_IMPLEMENTATION,
    objectType: ObjectType.HOUSE,
    description:
      'Дом 180 м² в два этажа: фундамент, коробка, кровля, окна. ' +
      'Внутренняя отделка отдельным заказом.',
    address: 'Московская обл., пос. Заречье, уч. 18',
    squareMeters: 180,
    // Исполнитель обмерил объект и уточнил площадь (ТЗ §4.1).
    verifiedSquareMeters: 186.5,
    clientBudget: '210000.00',
    desiredStartDate: daysFromNow(-20),
    price: '204000.00',
    deadline: daysFromNow(150),
    status: OrderStatus.IN_PROGRESS,
    files: [clientFile('Проект дома.pdf', 'application/pdf', 5_112_774)],
    offers: [
      {
        companyId: COMPANY_STROYGRAD,
        status: OfferStatus.ACCEPTED,
        proposedPrice: '204000.00',
        proposedDeadline: daysFromNow(150),
        comment: 'Начинаем с фундамента, поэтапная приёмка.',
      },
      {
        companyId: COMPANY_REMONT,
        status: OfferStatus.NOT_ACCEPTED,
        proposedPrice: '228000.00',
        proposedDeadline: daysFromNow(130),
      },
    ],
  },
  {
    title: 'Проект перепланировки квартиры',
    category: OrderCategory.PLAN_CREATION,
    objectType: ObjectType.APARTMENT,
    description:
      'Нужен проект перепланировки с объединением кухни и гостиной, ' +
      'пригодный для согласования.',
    address: 'Казань, ул. Баумана, 7, кв. 44',
    squareMeters: 72,
    clientBudget: '3000.00',
    price: '2800.00',
    deadline: daysFromNow(5),
    status: OrderStatus.AWAITING_COMPLETION_CONFIRMATION,
    files: [
      clientFile('Текущий план БТИ.pdf', 'application/pdf', 640_221),
      companyFile('Проект перепланировки.dwg', 'image/vnd.dwg', 3_882_010, 1),
      companyFile('Пояснительная записка.pdf', 'application/pdf', 918_443, 1),
    ],
    offers: [
      {
        companyId: COMPANY_ARCH,
        status: OfferStatus.WORK_SUBMITTED,
        proposedPrice: '2800.00',
        proposedDeadline: daysFromNow(5),
        comment: 'Проект готов, приложила записку для согласования.',
      },
    ],
  },
  {
    title: 'Ремонт санузла',
    category: OrderCategory.PLAN_IMPLEMENTATION,
    objectType: ObjectType.APARTMENT,
    description: 'Санузел 6 м²: гидроизоляция, плитка, сантехника, тёплый пол.',
    address: 'Санкт-Петербург, Невский пр., 88, кв. 5',
    squareMeters: 6,
    clientBudget: '4500.00',
    price: '4300.00',
    deadline: daysFromNow(-2),
    status: OrderStatus.COMPLETION_DISPUTED,
    correctionComment:
      'Затирка швов местами неровная, у душевого трапа стоит вода. ' +
      'Прошу переделать до приёмки.',
    files: [
      clientFile('Схема разводки.pdf', 'application/pdf', 402_115),
      companyFile('Фото после работ.jpg', 'image/jpeg', 2_204_910, 1),
    ],
    offers: [
      {
        companyId: COMPANY_REMONT,
        status: OfferStatus.BACK_FOR_OVERRIDE,
        proposedPrice: '4300.00',
        proposedDeadline: daysFromNow(-2),
      },
    ],
  },
  {
    title: 'Дизайн-проект кухни',
    category: OrderCategory.PLAN_CREATION,
    objectType: ObjectType.APARTMENT,
    description: 'Дизайн-проект кухни-столовой с расстановкой мебели и техники.',
    address: 'Москва, ул. Профсоюзная, 45, кв. 12',
    squareMeters: 18,
    clientBudget: '1500.00',
    price: '1400.00',
    deadline: daysFromNow(-10),
    status: OrderStatus.COMPLETED,
    clientCompletionComment: 'Всё отлично, спасибо за правки по цвету фасадов.',
    files: [
      // Две сдачи: первая ушла на доработку, вторая принята — на этом заказе
      // проверяется блок «История сдач» (ТЗ §4.1).
      companyFile('Дизайн-проект v1.pdf', 'application/pdf', 7_331_002, 1),
      companyFile('Дизайн-проект финал.pdf', 'application/pdf', 7_905_244, 2),
      companyFile('Визуализации.png', 'image/png', 4_120_338, 2),
    ],
    offers: [
      {
        companyId: COMPANY_STROYGRAD,
        status: OfferStatus.COMPLETED,
        proposedPrice: '1400.00',
        proposedDeadline: daysFromNow(-10),
      },
    ],
  },
];

async function seedOrders(): Promise<void> {
  for (const order of orders) {
    await prisma.order.create({
      data: {
        clientId: CLIENT_ID,
        title: order.title,
        category: order.category,
        objectType: order.objectType,
        description: order.description,
        address: order.address,
        squareMeters: order.squareMeters,
        verifiedSquareMeters: order.verifiedSquareMeters ?? null,
        clientBudget: order.clientBudget ?? null,
        desiredStartDate: order.desiredStartDate ?? null,
        price: order.price ?? null,
        deadline: order.deadline ?? null,
        status: order.status,
        clientCompletionComment: order.clientCompletionComment ?? null,
        correctionComment: order.correctionComment ?? null,
        offers: { create: order.offers },
        files: {
          create: order.files.map((file) => ({
            storageKey: `orders/${file.submissionRound}/${file.name}`,
            ownerType: file.ownerType,
            submissionRound: file.submissionRound,
            fileHash: fakeHash(file.name),
            originalName: file.name,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
          })),
        },
      },
    });
  }
}

/**
 * Уведомления по уже случившимся переходам: колокольчик и раздел
 * «Уведомления» должны быть не пустыми ещё до Фазы 5.
 */
async function seedNotifications(): Promise<void> {
  const byTitle = new Map(
    (
      await prisma.order.findMany({
        where: { clientId: CLIENT_ID },
        select: { id: true, orderNumber: true, title: true },
      })
    ).map((order) => [order.title, order]),
  );

  const ref = (title: string): string => {
    const order = byTitle.get(title);
    if (!order) throw new Error(`Заказ «${title}» не найден после создания`);
    return `${formatOrderNumber(order.orderNumber)} «${order.title}»`;
  };

  const orderId = (title: string): string => byTitle.get(title)!.id;

  await prisma.notification.createMany({
    data: [
      {
        userId: CLIENT_ID,
        type: NotificationType.OFFER_RECEIVED,
        orderId: orderId('Отделка офиса открытого типа'),
        title: 'Новое предложение',
        body: `${ref('Отделка офиса открытого типа')}: предложение от «ООО «СтройГрад»»`,
        isRead: false,
      },
      {
        userId: CLIENT_ID,
        type: NotificationType.OFFER_RECEIVED,
        orderId: orderId('Отделка офиса открытого типа'),
        title: 'Новое предложение',
        body: `${ref('Отделка офиса открытого типа')}: предложение от «ООО «Ремонт Плюс»»`,
        isRead: false,
      },
      {
        userId: CLIENT_ID,
        type: NotificationType.AREA_VERIFIED,
        orderId: orderId('Строительство частного дома'),
        title: 'Уточнена площадь',
        body: `${ref('Строительство частного дома')}: исполнитель уточнил площадь — 186.5 м²`,
        isRead: true,
      },
      {
        userId: CLIENT_ID,
        type: NotificationType.WORK_SUBMITTED,
        orderId: orderId('Проект перепланировки квартиры'),
        title: 'Работа сдана',
        body: `${ref('Проект перепланировки квартиры')}: работа сдана и ждёт вашего подтверждения`,
        isRead: false,
      },
      {
        userId: COMPANY_STROYGRAD,
        type: NotificationType.OFFER_ACCEPTED,
        orderId: orderId('Строительство частного дома'),
        title: 'Предложение принято',
        body: `${ref('Строительство частного дома')}: ваше предложение принято, можно приступать`,
        isRead: true,
      },
      {
        userId: COMPANY_STROYGRAD,
        type: NotificationType.WORK_CONFIRMED,
        orderId: orderId('Дизайн-проект кухни'),
        title: 'Работа принята',
        body: `${ref('Дизайн-проект кухни')}: клиент принял работу`,
        isRead: false,
      },
      {
        userId: COMPANY_REMONT,
        type: NotificationType.WORK_DISPUTED,
        orderId: orderId('Ремонт санузла'),
        title: 'Работа отправлена на доработку',
        body: `${ref('Ремонт санузла')}: клиент отправил работу на доработку`,
        isRead: false,
      },
      {
        userId: COMPANY_REMONT,
        type: NotificationType.OFFER_RECEIVED,
        orderId: orderId('Строительство частного дома'),
        title: 'Новое предложение',
        body: `${ref('Строительство частного дома')}: выбрано другое предложение`,
        isRead: true,
      },
    ],
  });
}

async function main(): Promise<void> {
  // Каскад по внешним ключам уносит заказы, предложения, файлы и уведомления.
  const { count } = await prisma.user.deleteMany({
    where: { id: { in: SEED_USER_IDS } },
  });
  if (count > 0) {
    console.log(`Удалены прежние тестовые пользователи: ${count}`);
  }

  await seedUsers();
  await seedOrders();
  await seedNotifications();

  const [users, ordersCount, offers, files, notifications] = await Promise.all([
    prisma.user.count({ where: { id: { in: SEED_USER_IDS } } }),
    prisma.order.count({ where: { clientId: CLIENT_ID } }),
    prisma.offer.count({ where: { companyId: { in: SEED_USER_IDS } } }),
    prisma.orderFile.count({ where: { order: { clientId: CLIENT_ID } } }),
    prisma.notification.count({ where: { userId: { in: SEED_USER_IDS } } }),
  ]);

  console.log(
    `Готово: пользователей ${users}, заказов ${ordersCount}, ` +
      `предложений ${offers}, файлов ${files}, уведомлений ${notifications}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('Seed не выполнен:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
