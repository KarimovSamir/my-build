import { Module } from '@nestjs/common';

import { ThrottleGuard } from '../../common/guards/throttle.guard.js';
import { HealthController } from './health.controller.js';

/** `ThrottleGuard` объявлен провайдером: он висит на контроллере через `@UseGuards`. */
@Module({
  controllers: [HealthController],
  providers: [ThrottleGuard],
})
export class HealthModule {}
