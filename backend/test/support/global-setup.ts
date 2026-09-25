import 'dotenv/config';

import { resetDatabase } from '../../src/modules/demo/database-wipe.js';
import { openDemoTools } from '../../src/modules/demo/demo-tools.js';

/**
 * Уборка после всего прогона e2e.
 *
 * e2e работают на боевой базе (решение пользователя) и заводят там своих
 * пользователей, компании и заказы. Пока прогон идёт, их видно посетителям;
 * после него база очищается целиком и получает стандартные демо-данные —
 * то же, что `npm run db:reset`.
 *
 * Уборка идёт и после упавших тестов. Если прогон прервали (Ctrl+C,
 * закрытый терминал), она могла не дойти — тогда `npm run db:reset` руками.
 */
export async function teardown(): Promise<void> {
  const tools = openDemoTools();

  try {
    const result = await resetDatabase(tools);
    console.log(
      `\nБаза возвращена к демо-данным: удалено учёток ${result.deletedUsers}, ` +
        `объектов в бакете ${result.removedObjects}`,
    );
  } finally {
    await tools.close();
  }
}
