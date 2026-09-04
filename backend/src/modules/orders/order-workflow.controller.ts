import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';

import {
  MAX_FILES_PER_REQUEST,
  MAX_FILE_SIZE_BYTES,
  Role,
  type OrderDetail,
} from '@mybuild/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import {
  OrderAccess,
  OrderAccessCtx,
  OrderAccessMode,
} from '../../common/decorators/order-access.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Throttle } from '../../common/decorators/throttle.decorator.js';
import {
  OwnershipGuard,
  type OrderAccessContext,
} from '../../common/guards/ownership.guard.js';
import { ThrottleGuard } from '../../common/guards/throttle.guard.js';
import { UploadSizeGuard } from '../../common/guards/upload-size.guard.js';
import { TempUploadCleanupInterceptor } from '../../common/interceptors/temp-upload-cleanup.interceptor.js';
import type { AuthUser } from '../auth/auth-user.js';
import { UPLOAD_TEMP_DIR } from '../files/uploaded-file.js';
import { toUploads, type MulterFile } from './multer-file.js';
import { ConfirmOrderDto, DisputeOrderDto } from './dto/completion.dto.js';
import { SubmitFilesDto } from './dto/submit-files.dto.js';
import { VerifiedAreaDto } from './dto/verified-area.dto.js';
import { OrderWorkflowService } from './order-workflow.service.js';

/**
 * Сделка и приёмка: путь заказа от выбора исполнителя до завершения (ТЗ §5).
 *
 * Отдельный контроллер при том же префиксе `orders`: `orders.controller.ts`
 * отвечает за жизненный цикл самого заказа (создать, найти, удалить), а здесь
 * живут действия сторон над уже существующим заказом. Один файл на десяток
 * маршрутов читался бы хуже, а Nest различает их по методу и пути.
 *
 * Все маршруты мутирующие: у каждого ограничитель частоты (ТЗ §6), и каждый
 * возвращает свежую карточку заказа — после любого из этих действий она
 * меняется целиком, и второй запрос за ней был бы лишним.
 */
@Controller('orders')
export class OrderWorkflowController {
  constructor(private readonly workflow: OrderWorkflowService) {}

  /** Клиент принимает предложение: заказ уходит в работу (ТЗ §4). */
  @Post(':id/accept-offer/:offerId')
  @Roles(Role.CLIENT)
  @UseGuards(ThrottleGuard, OwnershipGuard)
  @OrderAccess(OrderAccessMode.OWNER)
  @Throttle({ limit: 30, ttl: 60_000 })
  @HttpCode(HttpStatus.OK)
  acceptOffer(
    @CurrentUser() user: AuthUser,
    @OrderAccessCtx() access: OrderAccessContext,
    @Param('offerId') offerId: string,
  ): Promise<OrderDetail> {
    return this.workflow.acceptOffer(access.orderId, offerId, user.id);
  }

  /** Клиент подтверждает выполнение: заказ завершён (ТЗ §4). */
  @Post(':id/confirm')
  @Roles(Role.CLIENT)
  @UseGuards(ThrottleGuard, OwnershipGuard)
  @OrderAccess(OrderAccessMode.OWNER)
  @Throttle({ limit: 30, ttl: 60_000 })
  @HttpCode(HttpStatus.OK)
  confirm(
    @CurrentUser() user: AuthUser,
    @OrderAccessCtx() access: OrderAccessContext,
    @Body() dto: ConfirmOrderDto,
  ): Promise<OrderDetail> {
    return this.workflow.confirm(access.orderId, user.id, dto.comment);
  }

  /** Клиент отправляет работу на доработку (ТЗ §4). */
  @Post(':id/dispute')
  @Roles(Role.CLIENT)
  @UseGuards(ThrottleGuard, OwnershipGuard)
  @OrderAccess(OrderAccessMode.OWNER)
  @Throttle({ limit: 30, ttl: 60_000 })
  @HttpCode(HttpStatus.OK)
  dispute(
    @CurrentUser() user: AuthUser,
    @OrderAccessCtx() access: OrderAccessContext,
    @Body() dto: DisputeOrderDto,
  ): Promise<OrderDetail> {
    return this.workflow.dispute(access.orderId, user.id, dto.correctionComment);
  }

  /** Компания-исполнитель сдаёт работу на подтверждение (ТЗ §4). */
  @Post(':id/submit')
  @Roles(Role.COMPANY)
  @UseGuards(ThrottleGuard, OwnershipGuard)
  @OrderAccess(OrderAccessMode.EXECUTOR)
  @Throttle({ limit: 30, ttl: 60_000 })
  @HttpCode(HttpStatus.OK)
  submitWork(
    @CurrentUser() user: AuthUser,
    @OrderAccessCtx() access: OrderAccessContext,
  ): Promise<OrderDetail> {
    return this.workflow.submitWork(access.orderId, user.id);
  }

  /**
   * Файлы сдачи вместе с обязательным комментарием (ТЗ §4.1).
   *
   * Обвязка та же, что и у создания заказа: `UploadSizeGuard` отбивает
   * заведомо неподъёмный запрос по `Content-Length`, а
   * `TempUploadCleanupInterceptor` идёт первым — иначе отказ валидации DTO
   * оставил бы временные файлы на диске.
   */
  @Post(':id/files')
  @Roles(Role.COMPANY)
  @UseGuards(ThrottleGuard, UploadSizeGuard, OwnershipGuard)
  @OrderAccess(OrderAccessMode.EXECUTOR)
  @Throttle({ limit: 20, ttl: 60_000 })
  @UseInterceptors(
    TempUploadCleanupInterceptor,
    FilesInterceptor('files', MAX_FILES_PER_REQUEST, {
      dest: UPLOAD_TEMP_DIR,
      limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_FILES_PER_REQUEST },
      defParamCharset: 'utf8',
    }),
  )
  @HttpCode(HttpStatus.OK)
  addFiles(
    @CurrentUser() user: AuthUser,
    @OrderAccessCtx() access: OrderAccessContext,
    @Body() dto: SubmitFilesDto,
    @UploadedFiles() files: MulterFile[] | undefined,
  ): Promise<OrderDetail> {
    return this.workflow.addFiles({
      orderId: access.orderId,
      status: access.status,
      companyId: user.id,
      comment: dto.comment,
      uploads: toUploads(files),
    });
  }

  /** Компания-исполнитель уточняет площадь объекта (ТЗ §4.1). */
  @Patch(':id/verified-area')
  @Roles(Role.COMPANY)
  @UseGuards(ThrottleGuard, OwnershipGuard)
  @OrderAccess(OrderAccessMode.EXECUTOR)
  @Throttle({ limit: 30, ttl: 60_000 })
  verifyArea(
    @CurrentUser() user: AuthUser,
    @OrderAccessCtx() access: OrderAccessContext,
    @Body() dto: VerifiedAreaDto,
  ): Promise<OrderDetail> {
    return this.workflow.verifyArea(
      access.orderId,
      access.status,
      user.id,
      dto.verifiedSquareMeters,
    );
  }
}
