/**
 * Сделка и приёмка: всё, что происходит с заказом после того, как клиент
 * выбрал исполнителя (ТЗ §4, §4.1, §5).
 *
 * Логики статусов здесь нет — она в `OrderStateMachine`, а записывает её
 * `OrderTransitionService`. Этот сервис отвечает за то, чего машина не знает:
 * сдачи работы (их нумерацию и комментарий компании), уточнение площади
 * и уведомления о действиях, которые статус заказа не меняют.
 *
 * Права проверяет `OwnershipGuard` на маршрутах: `OWNER` — для действий
 * клиента, `EXECUTOR` — для действий компании-исполнителя.
 */

import { ConflictException, Injectable } from '@nestjs/common';
import {
  FileOwnerType,
  NotificationType,
  OrderStatus,
  canUploadWork,
  canVerifyArea,
  notificationTypeLabels,
  type OrderDetail,
} from '@mybuild/shared';

import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UploadedFileInput } from '../files/file-validation.js';
import { FilesService } from '../files/files.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { orderRef, type OrderRef } from './order-notification.js';
import { OrderEventType } from './order-state-machine.js';
import {
  OrderTransitionService,
  TRANSITION_TX_OPTIONS,
} from './order-transition.service.js';
import { OrdersService } from './orders.service.js';

const UPLOAD_FORBIDDEN =
  'Файлы сдачи добавляются, только пока заказ в работе или на доработке';

const NOTHING_TO_SUBMIT =
  'Нечего сдавать: сначала загрузите файлы работы с комментарием';

const SUBMISSION_ALREADY_SENT =
  'Эта сдача уже отправлена клиенту: файлы добавляются в следующую сдачу';

const AREA_FORBIDDEN =
  'Площадь уточняется только по заказу в работе, на проверке или на доработке';

/** Всё, что нужно для добавления файлов сдачи. */
export interface AddSubmissionFilesParams {
  orderId: string;
  /** Статус из снимка `OwnershipGuard` — для быстрого отказа до разбора файлов. */
  status: OrderStatus;
  /** Компания-исполнитель: она же увидит ответ. */
  companyId: string;
  comment: string;
  uploads: UploadedFileInput[];
}

/** Сдача, в которую попадут файлы, вместе с подписью заказа для уведомления. */
interface OpenSubmission {
  id: string;
  round: number;
  order: OrderRef & { clientId: string };
}

@Injectable()
export class OrderWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: OrderTransitionService,
    private readonly files: FilesService,
    private readonly orders: OrdersService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Клиент принимает предложение (ТЗ §4): цена и срок сделки берутся
   * из предложения, остальные предложения уходят в `NOT_ACCEPTED`.
   */
  async acceptOffer(
    orderId: string,
    offerId: string,
    clientId: string,
  ): Promise<OrderDetail> {
    const applied = await this.transitions.apply({
      type: OrderEventType.OFFER_ACCEPTED,
      orderId,
      offerId,
    });

    this.realtime.transitionApplied(applied);

    return this.orders.getDetail(orderId, { id: clientId });
  }

  /** Клиент подтверждает выполнение (ТЗ §4). Комментарий необязателен. */
  async confirm(
    orderId: string,
    clientId: string,
    comment?: string,
  ): Promise<OrderDetail> {
    const applied = await this.transitions.apply({
      type: OrderEventType.WORK_CONFIRMED,
      orderId,
      completionComment: comment,
    });

    this.realtime.transitionApplied(applied);

    return this.orders.getDetail(orderId, { id: clientId });
  }

  /** Клиент отправляет работу на доработку (ТЗ §4). Комментарий обязателен. */
  async dispute(
    orderId: string,
    clientId: string,
    correctionComment: string,
  ): Promise<OrderDetail> {
    const applied = await this.transitions.apply({
      type: OrderEventType.WORK_DISPUTED,
      orderId,
      correctionComment,
    });

    this.realtime.transitionApplied(applied);

    return this.orders.getDetail(orderId, { id: clientId });
  }

  /**
   * Компания сдаёт работу (ТЗ §4).
   *
   * Переход и закрытие сдачи — одна транзакция: разными коммитами заказ мог бы
   * уйти на проверку клиенту, а сдача остаться открытой, и следующая загрузка
   * файлов дописала бы их в уже сданный раунд.
   *
   * Сдавать нечего, пока компания ничего не загрузила: сдача без единого файла
   * и без комментария не сообщает клиенту ничего, а нумерация раундов после неё
   * перестала бы совпадать с файлами. Это правило ТЗ прямо не задаёт.
   */
  async submitWork(orderId: string, companyId: string): Promise<OrderDetail> {
    const applied = await this.prisma.$transaction(async (tx) => {
      await this.transitions.lockOrder(tx, orderId);

      const open = await this.findOpenSubmission(tx, orderId);

      // Переход первым: если заказ вообще не в том статусе, ответить надо
      // именно этим, а не «нечего сдавать».
      const transition = await this.transitions.apply(
        { type: OrderEventType.WORK_SUBMITTED, orderId },
        tx,
      );

      if (!open) {
        throw new ConflictException(NOTHING_TO_SUBMIT);
      }

      const files = await tx.orderFile.count({
        where: {
          orderId,
          ownerType: FileOwnerType.COMPANY,
          submissionRound: open.round,
        },
      });

      if (files === 0) {
        throw new ConflictException(NOTHING_TO_SUBMIT);
      }

      await tx.orderSubmission.update({
        where: { id: open.id },
        data: { submittedAt: new Date() },
      });

      return transition;
    }, TRANSITION_TX_OPTIONS);

    this.realtime.transitionApplied(applied);

    return this.orders.getDetail(orderId, { id: companyId });
  }

  /**
   * Компания добавляет файлы к текущей сдаче вместе с обязательным
   * комментарием (ТЗ §4.1).
   *
   * Статус заказа при этом не меняется: сдача считается сделанной только после
   * `POST /orders/:id/submit`. До тех пор файлы можно докладывать в тот же
   * раунд — комментарий каждый раз заменяется на свежий, потому что описывает
   * сдачу целиком, а не отдельную загрузку.
   *
   * Загрузка в хранилище идёт **после** транзакции: держать открытой
   * транзакцию, пока по сети едут десятки мегабайт, нельзя. Зато строки файлов
   * пишутся под повторной проверкой (`assertSubmissionOpen`): за время загрузки
   * компания могла из другой вкладки сдать работу, и файлы дописались бы
   * в уже сданный раунд.
   */
  async addFiles(params: AddSubmissionFilesParams): Promise<OrderDetail> {
    const { orderId, companyId } = params;

    // Быстрый отказ по снимку guard'а — до того, как файлы будут прочитаны
    // с диска и посчитаны их хеши. Настоящая проверка идёт под блокировкой.
    if (!canUploadWork(params.status)) {
      throw new ConflictException(UPLOAD_FORBIDDEN);
    }

    const prepared = await this.files.prepareUploads(params.uploads);

    const submission = await this.prisma.$transaction(
      (tx) => this.openSubmission(tx, orderId, params.comment),
      TRANSITION_TX_OPTIONS,
    );

    const added = await this.files.attachFiles({
      orderId,
      ownerType: FileOwnerType.COMPANY,
      submissionRound: submission.round,
      files: prepared,
      guard: (tx) => this.assertSubmissionOpen(tx, orderId, submission.id),
    });

    // Уведомление и событие — только если в заказе действительно что-то
    // появилось: повторная загрузка тех же файлов отсеивается дедупликацией
    // (ТЗ §4.1), и сообщать клиенту об изменении, которого не было, незачем.
    if (added.length > 0) {
      const notification = await this.prisma.notification.create({
        data: {
          // Адресат читается под блокировкой вместе с заказом, а не берётся
          // из снимка guard'а: у заказа один владелец, и это его строка.
          userId: submission.order.clientId,
          type: NotificationType.FILES_UPDATED,
          orderId,
          title: notificationTypeLabels[NotificationType.FILES_UPDATED],
          body: `${orderRef(submission.order)}: исполнитель добавил файлы (сдача №${submission.round})`,
        },
      });

      this.realtime.orderFilesUpdated(
        { id: orderId, clientId: submission.order.clientId },
        [notification],
      );
    }

    return this.orders.getDetail(orderId, { id: companyId });
  }

  /**
   * Компания уточняет площадь (ТЗ §4.1).
   *
   * Ни статус, ни цена от этого не меняются, а `squareMeters` клиента
   * не перезаписывается — это отдельное информационное поле.
   *
   * Повторное сохранение того же числа не считается уточнением: записывать
   * нечего, а уведомление «исполнитель уточнил площадь» на неизменившееся
   * значение — ложное событие в ленте клиента (ТЗ §8).
   */
  async verifyArea(
    orderId: string,
    status: OrderStatus,
    companyId: string,
    verifiedSquareMeters: number,
  ): Promise<OrderDetail> {
    if (!canVerifyArea(status)) {
      throw new ConflictException(AREA_FORBIDDEN);
    }

    const verified = await this.prisma.$transaction(async (tx) => {
      const order = await this.transitions.lockOrder(tx, orderId);

      // Между снимком guard'а и этой строкой клиент мог принять работу.
      if (!canVerifyArea(order.status)) {
        throw new ConflictException(AREA_FORBIDDEN);
      }

      if (order.verifiedSquareMeters === verifiedSquareMeters) {
        return null;
      }

      await tx.order.update({
        where: { id: orderId },
        data: { verifiedSquareMeters },
      });

      const notification = await tx.notification.create({
        data: {
          userId: order.clientId,
          type: NotificationType.AREA_VERIFIED,
          orderId,
          title: notificationTypeLabels[NotificationType.AREA_VERIFIED],
          body: `${orderRef(order)}: исполнитель уточнил площадь — ${verifiedSquareMeters} м²`,
        },
      });

      return { clientId: order.clientId, notification };
    }, TRANSITION_TX_OPTIONS);

    // Того же числа не было события — не будет и рассылки (ТЗ §8).
    if (verified) {
      this.realtime.orderAreaVerified({ id: orderId, clientId: verified.clientId }, [
        verified.notification,
      ]);
    }

    return this.orders.getDetail(orderId, { id: companyId });
  }

  /**
   * Сдача, в которую пишутся файлы: открытая, если она есть, иначе новая.
   *
   * Заказ берётся под блокировку первым — тем же порядком, что и в переходе:
   * иначе две транзакции взяли бы те же строки в обратном порядке. Под
   * блокировкой же считается номер раунда, поэтому две параллельные загрузки
   * не создадут две сдачи с одним номером.
   */
  private async openSubmission(
    tx: Prisma.TransactionClient,
    orderId: string,
    comment: string,
  ): Promise<OpenSubmission> {
    const order = await this.transitions.lockOrder(tx, orderId);

    if (!canUploadWork(order.status)) {
      throw new ConflictException(UPLOAD_FORBIDDEN);
    }

    const open = await this.findOpenSubmission(tx, orderId);

    if (open) {
      await tx.orderSubmission.update({ where: { id: open.id }, data: { comment } });
      return { ...open, order };
    }

    const last = await tx.orderSubmission.findFirst({
      where: { orderId },
      orderBy: { round: 'desc' },
      select: { round: true },
    });

    const created = await tx.orderSubmission.create({
      data: { orderId, round: (last?.round ?? 0) + 1, comment },
      select: { id: true, round: true },
    });

    return { ...created, order };
  }

  /**
   * Сдача всё ещё открыта, и заказ всё ещё принимает файлы.
   *
   * Вызывается изнутри транзакции вставки файлов, уже после загрузки
   * в хранилище: за это время параллельная «Сдача работы» могла закрыть раунд
   * и увести заказ на подтверждение клиенту. Порядок блокировок тот же, что
   * и везде, — сначала заказ.
   */
  private async assertSubmissionOpen(
    tx: Prisma.TransactionClient,
    orderId: string,
    submissionId: string,
  ): Promise<void> {
    const order = await this.transitions.lockOrder(tx, orderId);

    if (!canUploadWork(order.status)) {
      throw new ConflictException(UPLOAD_FORBIDDEN);
    }

    const submission = await tx.orderSubmission.findFirst({
      where: { id: submissionId, submittedAt: null },
      select: { id: true },
    });

    if (!submission) {
      throw new ConflictException(SUBMISSION_ALREADY_SENT);
    }
  }

  /**
   * Сдача, которую компания ещё не отправила клиенту. Их не может быть двух:
   * закрывает сдачу только переход `WORK_SUBMITTED`, а он же сразу уводит
   * заказ из статусов, в которых открывается новая.
   */
  private async findOpenSubmission(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<{ id: string; round: number } | null> {
    return tx.orderSubmission.findFirst({
      where: { orderId, submittedAt: null },
      orderBy: { round: 'desc' },
      select: { id: true, round: true },
    });
  }
}
