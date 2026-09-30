import { EventEmitter } from 'node:events';

import {
  BadRequestException,
  ExecutionContext,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { FileOwnerType, OrderStatus, Role } from '@mybuild/shared';

import type { OrderAccessContext } from '../../common/guards/ownership.guard.js';
import { UploadSlots } from '../../common/upload-slots.js';
import type { AuthUser } from '../auth/auth-user.js';
import type { FilesService } from '../files/files.service.js';
import { UploadAdmissionGuard } from './upload-admission.guard.js';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';

function user(id: string, role: Role): AuthUser {
  return { id, email: null, emailVerified: true, role, isDemo: false, sessionId: null };
}

function contextFor(request: object): { context: ExecutionContext; response: EventEmitter } {
  const response = new EventEmitter();

  return {
    response,
    context: {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as unknown as ExecutionContext,
  };
}

function filesStub(refusal?: Error) {
  return {
    assertRoomForUpload: vi.fn(
      async (_params: {
        orderId: string | null;
        clientId: string;
        uploader: FileOwnerType;
        declaredBytes: number;
      }) => {
        if (refusal) throw refusal;
      },
    ),
  };
}

function guardWith(files: ReturnType<typeof filesStub>, slots: UploadSlots) {
  return new UploadAdmissionGuard(files as unknown as FilesService, slots);
}

const access: OrderAccessContext = {
  orderId: ORDER_ID,
  clientId: CLIENT_ID,
  status: OrderStatus.IN_PROGRESS,
  isOwner: false,
  ownOffer: null,
};

describe('UploadAdmissionGuard', () => {
  it('новый заказ: квота считается по создающему клиенту и объявленной длине', async () => {
    const files = filesStub();
    const { context } = contextFor({
      user: user(CLIENT_ID, Role.CLIENT),
      headers: { 'content-length': '5242880' },
    });

    await expect(guardWith(files, new UploadSlots(1)).canActivate(context)).resolves.toBe(true);
    expect(files.assertRoomForUpload).toHaveBeenCalledWith({
      orderId: null,
      clientId: CLIENT_ID,
      uploader: FileOwnerType.CLIENT,
      declaredBytes: 5_242_880,
    });
  });

  it('сдача работы: квота заказа и его заказчика, загружает компания', async () => {
    const files = filesStub();
    const { context } = contextFor({
      user: user(COMPANY_ID, Role.COMPANY),
      headers: { 'content-length': '1000' },
      orderAccess: access,
    });

    await guardWith(files, new UploadSlots(1)).canActivate(context);

    expect(files.assertRoomForUpload).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      clientId: CLIENT_ID,
      uploader: FileOwnerType.COMPANY,
      declaredBytes: 1000,
    });
  });

  it('не влезающий в квоту запрос отбивается и места в приёме не занимает', async () => {
    const slots = new UploadSlots(1);
    const { context } = contextFor({
      user: user(CLIENT_ID, Role.CLIENT),
      headers: { 'content-length': '1000' },
    });

    await expect(
      guardWith(filesStub(new BadRequestException('квота')), slots).canActivate(context),
    ).rejects.toThrow(BadRequestException);
    expect(slots.inUse).toBe(0);
  });

  it('сверх предела одновременных загрузок — 503, после закрытия ответа место свободно', async () => {
    const slots = new UploadSlots(1);
    const guard = guardWith(filesStub(), slots);
    const request = { user: user(CLIENT_ID, Role.CLIENT), headers: { 'content-length': '1' } };

    const first = contextFor(request);
    await guard.canActivate(first.context);

    await expect(guard.canActivate(contextFor(request).context)).rejects.toThrow(
      ServiceUnavailableException,
    );

    first.response.emit('close');

    expect(slots.inUse).toBe(0);
    await expect(guard.canActivate(contextFor(request).context)).resolves.toBe(true);
  });
});
