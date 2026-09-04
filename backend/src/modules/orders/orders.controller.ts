import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
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
  type OrderListItem,
  type Paginated,
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
import { CreateOrderDto } from './dto/create-order.dto.js';
import { ListOrdersQueryDto } from './dto/list-orders.dto.js';
import { OrdersService } from './orders.service.js';

/**
 * Заказы (ТЗ §5).
 *
 * Создание, список и удаление — только для клиента: заказ заводит и закрывает
 * он. Детали открыты обеим ролям, но состав ответа зависит от того, кто
 * смотрит (ТЗ §4.1) — этим занимается `order-view`, а не контроллер.
 */

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * Создать заказ вместе с файлами (ТЗ §4.1).
   *
   * `dest` вместо памяти: multer пишет файлы во временный каталог, иначе
   * содержимое всего запроса (до 10 × 20 МБ) держалось бы в куче процесса.
   * Убирает их `TempUploadCleanupInterceptor` — он идёт первым, чтобы
   * охватить и разбор multipart, и отказ валидации DTO.
   *
   * `defParamCharset: 'utf8'` обязателен: по умолчанию multer читает имена
   * файлов из multipart как latin1, и «План.pdf» попал бы в базу как
   * «ÐÐ»Ð°Ð½.pdf».
   */
  @Post()
  @Roles(Role.CLIENT)
  // `UploadSizeGuard` — до интерсепторов: заведомо неподъёмный запрос
  // отбивается по Content-Length, не записав ни байта.
  @UseGuards(ThrottleGuard, UploadSizeGuard)
  @Throttle({ limit: 20, ttl: 60_000 })
  @UseInterceptors(
    TempUploadCleanupInterceptor,
    FilesInterceptor('files', MAX_FILES_PER_REQUEST, {
      dest: UPLOAD_TEMP_DIR,
      limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_FILES_PER_REQUEST },
      defParamCharset: 'utf8',
    }),
  )
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrderDto,
    @UploadedFiles() files: MulterFile[] | undefined,
  ): Promise<OrderDetail> {
    return this.orders.create(user.id, dto, toUploads(files));
  }

  /** Свои заказы: фильтр по статусу, поиск, пагинация (ТЗ §4.1). */
  @Get()
  @Roles(Role.CLIENT)
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListOrdersQueryDto,
  ): Promise<Paginated<OrderListItem>> {
    return this.orders.list(user.id, query);
  }

  /** Детали заказа. Ответ ролезависимый (ТЗ §4.1, «Приватность и видимость»). */
  @Get(':id')
  @UseGuards(OwnershipGuard)
  @OrderAccess(OrderAccessMode.VIEWER)
  getOne(
    @CurrentUser() user: AuthUser,
    @OrderAccessCtx() access: OrderAccessContext,
  ): Promise<OrderDetail> {
    return this.orders.getDetail(access.orderId, { id: user.id });
  }

  /** Удалить свой заказ, пока работы не начались (ТЗ §4.1). */
  @Delete(':id')
  @Roles(Role.CLIENT)
  // Порядок важен: ограничитель дешевле похода в базу, поэтому идёт первым.
  @UseGuards(ThrottleGuard, OwnershipGuard)
  @OrderAccess(OrderAccessMode.OWNER)
  @Throttle({ limit: 30, ttl: 60_000 })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@OrderAccessCtx() access: OrderAccessContext): Promise<void> {
    return this.orders.remove(access.orderId, access.status);
  }
}
