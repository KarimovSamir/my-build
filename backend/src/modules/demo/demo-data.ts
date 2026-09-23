/**
 * Содержимое демо: учётки с экрана входа, по заказу на каждый статус
 * state-машины и уведомления к ним (ТЗ §10, Фаза 1).
 *
 * Отсюда берут данные и `npm run db:seed`, и плановый сброс демо на сервере
 * (`demo-reset.ts`) — одна копия, чтобы сброс возвращал ровно то, что
 * заводит seed.
 *
 * Файлы существуют только строками в БД: в бакете Supabase Storage их нет,
 * поэтому скачивание по signed URL на демо-данных отдаёт 404.
 */

import { createHash } from 'node:crypto';

import { DEMO_EMAILS, formatOrderNumber } from '@mybuild/shared';

import {
  FileOwnerType,
  NotificationType,
  ObjectType,
  OfferStatus,
  OrderCategory,
  OrderStatus,
  Role,
  type Prisma,
} from '../../generated/prisma/client.js';
import type { AuthUserMetadata } from '../../supabase/supabase-admin.js';
import { buildStorageKey, sanitizeFileName } from '../files/file-validation.js';

export type DemoUserKey = keyof typeof DEMO_EMAILS;

export interface DemoUser {
  key: DemoUserKey;
  email: string;
  /** Из них триггер собирает профиль, и к ним же сброс возвращает профиль. */
  metadata: AuthUserMetadata;
}

/** Идентификаторы учёток: их выдаёт Supabase Auth, поэтому известны только после создания. */
export type DemoUserIds = ReadonlyMap<DemoUserKey, string>;

// Постоянные адреса вместо постоянных id: id выдаёт Supabase Auth.
// Сами адреса — из `shared/`: их же показывает экран входа (`DEMO_ACCOUNTS`),
// и расхождение означало бы кнопку «Войти» без учётной записи за ней.
export const DEMO_USERS: readonly DemoUser[] = [
  {
    key: 'client',
    email: DEMO_EMAILS.client,
    metadata: {
      role: Role.CLIENT,
      firstName: 'Анна',
      lastName: 'Смирнова',
      phone: '+994 50 100-10-01',
      city: 'Баку',
      country: 'Азербайджан',
    },
  },
  {
    key: 'stroygrad',
    email: DEMO_EMAILS.stroygrad,
    metadata: {
      role: Role.COMPANY,
      firstName: 'Иван',
      lastName: 'Петров',
      phone: '+994 51 200-20-02',
      companyName: 'ООО «СтройГрад»',
      city: 'Баку',
      country: 'Азербайджан',
    },
  },
  {
    key: 'remont',
    email: DEMO_EMAILS.remont,
    metadata: {
      role: Role.COMPANY,
      firstName: 'Пётр',
      lastName: 'Козлов',
      phone: '+994 55 300-30-03',
      companyName: 'ООО «Ремонт Плюс»',
      city: 'Сумгаит',
      country: 'Азербайджан',
    },
  },
  {
    key: 'arch',
    email: DEMO_EMAILS.arch,
    metadata: {
      role: Role.COMPANY,
      firstName: 'Ольга',
      lastName: 'Новикова',
      phone: '+994 70 400-40-04',
      companyName: 'ООО «АрхПроект»',
      city: 'Гянджа',
      country: 'Азербайджан',
    },
  },
];

/** id учётки. Отсутствие — ошибка сброса, а не повод молча пропустить заказ. */
function idOf(ids: DemoUserIds, key: DemoUserKey): string {
  const id = ids.get(key);
  if (!id) throw new Error(`Демо-учётка «${key}» не создана`);
  return id;
}

/**
 * Профиль в том виде, в каком его создаёт триггер из метаданных. Сброс
 * возвращает к нему профиль, не пересоздавая учётку.
 */
export function demoProfile(user: DemoUser): Prisma.UserUpdateInput {
  const { metadata } = user;

  return {
    firstName: metadata.firstName,
    lastName: metadata.lastName ?? null,
    phone: metadata.phone,
    companyName:
      metadata.role === Role.COMPANY ? (metadata.companyName ?? null) : null,
    city: metadata.city ?? null,
    country: metadata.country ?? null,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Дата со сдвигом в днях от текущего момента: сроки должны выглядеть живыми. */
function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY_MS);
}

/** Хеш содержимого файла. Настоящих файлов нет — считаем от имени. */
function fakeHash(name: string): string {
  return createHash('sha256').update(name).digest('hex');
}

interface DemoFile {
  name: string;
  mimeType: string;
  sizeBytes: number;
  ownerType: FileOwnerType;
  submissionRound: number;
}

function clientFile(
  name: string,
  mimeType: string,
  sizeBytes: number,
): DemoFile {
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
): DemoFile {
  return {
    name,
    mimeType,
    sizeBytes,
    ownerType: FileOwnerType.COMPANY,
    submissionRound,
  };
}

/** Сдача работы: комментарий компании к файлам того же раунда (ТЗ §4.1). */
interface DemoSubmission {
  round: number;
  comment: string;
  /** Все сдачи в демо уже отправлены клиенту: открытых раундов нет. */
  submittedAt: Date;
}

interface DemoOrder {
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
  files: DemoFile[];
  /** По одной записи на каждый раунд файлов компании. */
  submissions?: DemoSubmission[];
  offers: {
    companyId: string;
    status: OfferStatus;
    proposedPrice: string;
    proposedDeadline: Date;
    comment?: string;
  }[];
}

/**
 * По одному заказу на каждый статус — чтобы экраны было чем наполнить.
 * Функция, а не константа: идентификаторы компаний известны только после
 * создания учётных записей, а сроки считаются от момента сброса.
 */
const buildOrders = (ids: DemoUserIds): DemoOrder[] => [
  {
    title: 'Ремонт квартиры 100 м²',
    category: OrderCategory.PLAN_IMPLEMENTATION,
    objectType: ObjectType.APARTMENT,
    description:
      'Полный ремонт двухкомнатной квартиры: демонтаж, электрика, ' +
      'выравнивание стен, чистовая отделка. Материалы за счёт заказчика.',
    address: 'Баку, ул. Низами, 45, кв. 12',
    squareMeters: 100,
    clientBudget: '30600.00',
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
    address: 'Баку, Приморский бул., 12, этаж 8',
    squareMeters: 320,
    clientBudget: '88400.00',
    desiredStartDate: daysFromNow(30),
    status: OrderStatus.AWAITING_CONFIRMATION,
    files: [
      clientFile('Обмерный план офиса.pdf', 'application/pdf', 1_204_882),
      clientFile('Референсы интерьера.png', 'image/png', 2_931_004),
    ],
    offers: [
      {
        companyId: idOf(ids, 'stroygrad'),
        status: OfferStatus.SENT,
        proposedPrice: '84200.00',
        proposedDeadline: daysFromNow(75),
        comment: 'Своя бригада, работаем без выходных. Гарантия 2 года.',
      },
      {
        companyId: idOf(ids, 'remont'),
        status: OfferStatus.SENT,
        proposedPrice: '95200.00',
        proposedDeadline: daysFromNow(60),
        comment: 'Срок короче за счёт двух смен. Материалы закупаем сами.',
      },
      {
        // Отозванное предложение: заказ должен снова быть виден этой компании
        // в ленте доступных (ТЗ §4.1).
        companyId: idOf(ids, 'arch'),
        status: OfferStatus.WITHDRAWN,
        proposedPrice: '103700.00',
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
    address: 'Абшеронский р-н, пос. Мардакян, уч. 18',
    squareMeters: 180,
    // Исполнитель обмерил объект и уточнил площадь (ТЗ §4.1).
    verifiedSquareMeters: 186.5,
    clientBudget: '357000.00',
    desiredStartDate: daysFromNow(-20),
    price: '346800.00',
    deadline: daysFromNow(150),
    status: OrderStatus.IN_PROGRESS,
    files: [clientFile('Проект дома.pdf', 'application/pdf', 5_112_774)],
    offers: [
      {
        companyId: idOf(ids, 'stroygrad'),
        status: OfferStatus.ACCEPTED,
        proposedPrice: '346800.00',
        proposedDeadline: daysFromNow(150),
        comment: 'Начинаем с фундамента, поэтапная приёмка.',
      },
      {
        companyId: idOf(ids, 'remont'),
        status: OfferStatus.NOT_ACCEPTED,
        proposedPrice: '387600.00',
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
    address: 'Гянджа, ул. Джавадхана, 7, кв. 44',
    squareMeters: 72,
    clientBudget: '5100.00',
    price: '4800.00',
    deadline: daysFromNow(5),
    status: OrderStatus.AWAITING_COMPLETION_CONFIRMATION,
    files: [
      clientFile('Текущий план БТИ.pdf', 'application/pdf', 640_221),
      companyFile('Проект перепланировки.dwg', 'image/vnd.dwg', 3_882_010, 1),
      companyFile('Пояснительная записка.pdf', 'application/pdf', 918_443, 1),
    ],
    submissions: [
      {
        round: 1,
        comment:
          'Проект готов, приложила пояснительную записку для согласования.',
        submittedAt: daysFromNow(-1),
      },
    ],
    offers: [
      {
        companyId: idOf(ids, 'arch'),
        status: OfferStatus.WORK_SUBMITTED,
        proposedPrice: '4800.00',
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
    address: 'Сумгаит, пр. Нефтяников, 88, кв. 5',
    squareMeters: 6,
    clientBudget: '7700.00',
    price: '7300.00',
    deadline: daysFromNow(-2),
    status: OrderStatus.COMPLETION_DISPUTED,
    correctionComment:
      'Затирка швов местами неровная, у душевого трапа стоит вода. ' +
      'Прошу переделать до приёмки.',
    files: [
      clientFile('Схема разводки.pdf', 'application/pdf', 402_115),
      companyFile('Фото после работ.jpg', 'image/jpeg', 2_204_910, 1),
    ],
    // Сдача отправлена и вернулась на доработку: следующий раунд компания
    // откроет сама, загрузив исправления.
    submissions: [
      {
        round: 1,
        comment: 'Работы закончены, прикладываю фото.',
        submittedAt: daysFromNow(-3),
      },
    ],
    offers: [
      {
        companyId: idOf(ids, 'remont'),
        status: OfferStatus.BACK_FOR_OVERRIDE,
        proposedPrice: '7300.00',
        proposedDeadline: daysFromNow(-2),
      },
    ],
  },
  {
    title: 'Дизайн-проект кухни',
    category: OrderCategory.PLAN_CREATION,
    objectType: ObjectType.APARTMENT,
    description:
      'Дизайн-проект кухни-столовой с расстановкой мебели и техники.',
    address: 'Баку, ул. Низами, 45, кв. 12',
    squareMeters: 18,
    clientBudget: '2600.00',
    price: '2400.00',
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
    submissions: [
      {
        round: 1,
        comment: 'Первый вариант дизайн-проекта на согласование.',
        submittedAt: daysFromNow(-16),
      },
      {
        round: 2,
        comment: 'Поправил цвет фасадов, добавил визуализации.',
        submittedAt: daysFromNow(-11),
      },
    ],
    offers: [
      {
        companyId: idOf(ids, 'stroygrad'),
        status: OfferStatus.COMPLETED,
        proposedPrice: '2400.00',
        proposedDeadline: daysFromNow(-10),
      },
    ],
  },
];

/** Заказы демо-клиента вместе с предложениями, сдачами и строками файлов. */
export async function createDemoOrders(
  tx: Prisma.TransactionClient,
  ids: DemoUserIds,
): Promise<void> {
  for (const order of buildOrders(ids)) {
    // Заказ создаётся первым, а файлы — следом: ключ объекта в хранилище
    // содержит идентификатор заказа, и до вставки его ещё нет.
    // Последовательность нужна номерам заказов: они идут в порядке списка.
    // oxlint-disable-next-line no-await-in-loop
    const created = await tx.order.create({
      data: {
        clientId: idOf(ids, 'client'),
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
        // Сдача — это комментарий компании плюс файлы того же раунда;
        // без неё карточка заказа показала бы файлы «ничьей» сдачи.
        submissions: { create: order.submissions ?? [] },
      },
    });

    // oxlint-disable-next-line no-await-in-loop
    await tx.orderFile.createMany({
      data: order.files.map((file) => {
        const prepared = {
          fileHash: fakeHash(file.name),
          safeName: sanitizeFileName(file.name),
        };

        return {
          orderId: created.id,
          // Ключ строится той же функцией, что и при настоящей загрузке:
          // иначе демо-данные выглядели бы как файлы приложения, но лежали
          // бы не там, где их ищет `FilesService`.
          storageKey: buildStorageKey(
            created.id,
            file.ownerType,
            file.submissionRound,
            prepared,
          ),
          ownerType: file.ownerType,
          submissionRound: file.submissionRound,
          fileHash: prepared.fileHash,
          originalName: file.name,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
        };
      }),
    });
  }
}

/** Уведомления по уже случившимся переходам: колокольчик не должен быть пустым. */
export async function createDemoNotifications(
  tx: Prisma.TransactionClient,
  ids: DemoUserIds,
): Promise<void> {
  const clientId = idOf(ids, 'client');
  const byTitle = new Map(
    (
      await tx.order.findMany({
        where: { clientId },
        select: { id: true, orderNumber: true, title: true },
      })
    ).map((order) => [order.title, order]),
  );

  const orderOf = (title: string) => {
    const order = byTitle.get(title);
    if (!order) throw new Error(`Заказ «${title}» не найден после создания`);
    return order;
  };

  const ref = (title: string): string => {
    const order = orderOf(title);
    return `${formatOrderNumber(order.orderNumber)} «${order.title}»`;
  };

  const orderId = (title: string): string => orderOf(title).id;

  await tx.notification.createMany({
    data: [
      {
        userId: clientId,
        type: NotificationType.OFFER_RECEIVED,
        orderId: orderId('Отделка офиса открытого типа'),
        title: 'Новое предложение',
        body: `${ref('Отделка офиса открытого типа')}: предложение от «ООО «СтройГрад»»`,
        isRead: false,
      },
      {
        userId: clientId,
        type: NotificationType.OFFER_RECEIVED,
        orderId: orderId('Отделка офиса открытого типа'),
        title: 'Новое предложение',
        body: `${ref('Отделка офиса открытого типа')}: предложение от «ООО «Ремонт Плюс»»`,
        isRead: false,
      },
      {
        userId: clientId,
        type: NotificationType.AREA_VERIFIED,
        orderId: orderId('Строительство частного дома'),
        title: 'Уточнена площадь',
        body: `${ref('Строительство частного дома')}: исполнитель уточнил площадь — 186.5 м²`,
        isRead: true,
      },
      {
        userId: clientId,
        type: NotificationType.WORK_SUBMITTED,
        orderId: orderId('Проект перепланировки квартиры'),
        title: 'Работа сдана',
        body: `${ref('Проект перепланировки квартиры')}: работа сдана и ждёт вашего подтверждения`,
        isRead: false,
      },
      {
        userId: idOf(ids, 'stroygrad'),
        type: NotificationType.OFFER_ACCEPTED,
        orderId: orderId('Строительство частного дома'),
        title: 'Предложение принято',
        body: `${ref('Строительство частного дома')}: ваше предложение принято, можно приступать`,
        isRead: true,
      },
      {
        userId: idOf(ids, 'stroygrad'),
        type: NotificationType.WORK_CONFIRMED,
        orderId: orderId('Дизайн-проект кухни'),
        title: 'Работа принята',
        body: `${ref('Дизайн-проект кухни')}: клиент принял работу`,
        isRead: false,
      },
      {
        userId: idOf(ids, 'remont'),
        type: NotificationType.WORK_DISPUTED,
        orderId: orderId('Ремонт санузла'),
        title: 'Работа отправлена на доработку',
        body: `${ref('Ремонт санузла')}: клиент отправил работу на доработку`,
        isRead: false,
      },
      {
        // Проигравшей компании — то же уведомление, что создаёт машина
        // при принятии чужого предложения (ТЗ §4, §8).
        userId: idOf(ids, 'remont'),
        type: NotificationType.OFFER_REJECTED,
        orderId: orderId('Строительство частного дома'),
        title: 'Предложение отклонено',
        body: `${ref('Строительство частного дома')}: клиент выбрал другое предложение`,
        isRead: true,
      },
    ],
  });
}
