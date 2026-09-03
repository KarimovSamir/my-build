import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'mybuild:isPublic';

/**
 * Маршрут доступен без токена.
 *
 * Защита включена по умолчанию для всего API: `SupabaseAuthGuard` висит
 * глобально, и новый контроллер закрыт сразу, без отдельного действия.
 * Открытость — осознанное исключение, и оно видно прямо на маршруте.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
