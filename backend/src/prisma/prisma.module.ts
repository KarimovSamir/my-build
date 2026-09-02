import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service.js';

/** Глобальный модуль: PrismaService доступен во всех модулях без импорта. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
