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
import {
  UPLOAD_MULTER_OPTIONS,
  toUploads,
  type MulterFile,
} from './multer-file.js';
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
   * Настройки multer общие с загрузкой сдачи — см. `UPLOAD_MULTER_OPTIONS`.
   * `TempUploadCleanupInterceptor` идёт первым, чтобы охватить и разбор
   * multipart, и отказ валидации DTO.
   */
  @Post()
  @Roles(Role.CLIENT)
  // `UploadSizeGuard` — до интерсепторов: заведомо неподъёмный запрос
  // отбивается по Content-Length, не записав ни байта.
  @UseGuards(ThrottleGuard, UploadSizeGuard)
  @Throttle({ limit: 20, ttl: 60_000 })
  @UseInterceptors(
    TempUploadCleanupInterceptor,
    FilesInterceptor('files', MAX_FILES_PER_REQUEST, UPLOAD_MULTER_OPTIONS),
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
  // Читающий маршрут, но не бесплатный: `COUNT` плюс выборка, а с `?q=` ещё
  // и `LIKE '%…%'` по нескольким колонкам. Лимит с запасом на обычную
  // работу — список перечитывается на каждое событие сокета и каждую
  // страницу, — но поток «в цикле» упрётся сразу.
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 120, ttl: 60_000 })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListOrdersQueryDto,
  ): Promise<Paginated<OrderListItem>> {
    return this.orders.list(user.id, query);
  }

  /** Детали заказа. Ответ ролезависимый (ТЗ §4.1, «Приватность и видимость»). */
  @Get(':id')
  // Порядок тот же, что у `remove`: ограничитель дешевле похода в базу.
  // Карточка тянет заказ со связями и список файлов — самый тяжёлый ответ
  // из читающих, и открыт он любой компании по любому заказу.
  @UseGuards(ThrottleGuard, OwnershipGuard)
  @OrderAccess(OrderAccessMode.VIEWER)
  @Throttle({ limit: 120, ttl: 60_000 })
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
