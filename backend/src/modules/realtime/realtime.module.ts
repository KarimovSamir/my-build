import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { OrderGateway } from './order.gateway.js';
import { RealtimeService } from './realtime.service.js';

/**
 * Real-time (ТЗ §8).
 *
 * Наружу отдаётся только `RealtimeService`: сервисы заказов и предложений
 * не должны знать ни про socket.io, ни про комнаты. Сам шлюз остаётся
 * внутренним — второго места, откуда что-то уходит в сокет, быть не должно.
 *
 * `AuthModule` импортируется явно, хотя он и глобальный: шлюз проверяет токен
 * тем же `SupabaseJwtService`, что и REST, и модуль должен собираться сам по
 * себе — иначе он ломает любую сборку без полного `AppModule` (так собран
 * `test/order-transition.e2e-spec.ts`).
 */
@Module({
  imports: [AuthModule],
  providers: [OrderGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
