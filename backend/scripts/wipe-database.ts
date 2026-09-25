import 'dotenv/config';

import { resetDatabase, wipeDatabase } from '../src/modules/demo/database-wipe.js';
import { openDemoTools } from '../src/modules/demo/demo-tools.js';

/**
 * Полная очистка базы после тестов и ручных проверок.
 *
 *   npm run db:wipe   — удалить всё, кроме четырёх демо-учёток (и файлы в бакете);
 *   npm run db:reset  — то же и сразу залить стандартные демо-данные.
 *
 * Работает с базой из backend/.env — то есть с боевой: e2e и проверки идут
 * там же (решение пользователя). Удаляются и учётки, которые завели
 * посетители. После `db:wipe` демо пустое, пока не выполнен `db:seed`, —
 * поэтому обычно нужен `db:reset`.
 */
const restore = process.argv.includes('--restore');
const tools = openDemoTools();

async function main(): Promise<void> {
  if (restore) {
    const result = await resetDatabase(tools);
    console.log(
      `Готово: удалено учёток ${result.deletedUsers}, объектов в бакете ${result.removedObjects}; ` +
        `демо-данные залиты заново${result.recreatedUsers > 0 ? `, учёток создано ${result.recreatedUsers}` : ''}`,
    );
    return;
  }

  const result = await wipeDatabase(tools);
  console.log(
    `Готово: удалено учёток ${result.deletedUsers}, объектов в бакете ${result.removedObjects}. ` +
      'Демо сейчас пустое — залить данные: npm run db:seed',
  );
}

main()
  .catch((error: unknown) => {
    console.error('Очистка не выполнена:', error);
    process.exitCode = 1;
  })
  .finally(() => tools.close());
