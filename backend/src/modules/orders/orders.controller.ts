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
import type { AuthUser } from '../auth/auth-user.js';
import type { UploadedFileInput } from '../files/file-validation.js';
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

/**
 * То, что multer кладёт в запрос. Пакет `@types/multer` не ставим: из всего
 * его описания нам нужны три поля, а лишняя зависимость — лишний повод
 * для конфликта версий.
 */
interface MulterFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * Создать заказ вместе с файлами (ТЗ §4.1).
   *
   * `defParamCharset: 'utf8'` обязателен: по умолчанию multer читает имена
   * файлов из multipart как latin1, и «План.pdf» попал бы в базу как
   * «ÐÐ»Ð°Ð½.pdf».
   */
  @Post()
  @Roles(Role.CLIENT)
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 20, ttl: 60_000 })
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES_PER_REQUEST, {
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

/** Файлы multer → форма, с которой работает `FilesService`. */
function toUploads(files: MulterFile[] | undefined): UploadedFileInput[] {
  return (files ?? []).map((file) => ({
    originalName: file.originalname,
    mimeType: file.mimetype,
    buffer: file.buffer,
  }));
}
