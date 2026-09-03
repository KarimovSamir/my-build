import 'dotenv/config';

import { MAX_FILE_SIZE_BYTES } from '@mybuild/shared';

import { createSupabaseAdminClient } from '../src/supabase/supabase-admin.js';

/**
 * Создать приватный бакет для файлов заказов, если его ещё нет (ТЗ §6).
 *
 * Бакет — часть окружения, как и миграции базы: на свежем проекте Supabase
 * его надо завести до первой загрузки. Скрипт идемпотентен, повторный запуск
 * только приводит настройки к нужным.
 *
 * Запуск: `npm run storage:setup -w backend`.
 */
async function main(): Promise<void> {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'order-files';
  const admin = createSupabaseAdminClient();

  const settings = {
    // Приватный: файлы отдаются только signed URL'ами, которые выпускает
    // backend после проверки участия в заказе.
    public: false,
    // Дубль лимита из ТЗ §5. Валидация есть и в FilesService; здесь она
    // страхует от загрузки в обход сервиса (например, из скрипта).
    fileSizeLimit: MAX_FILE_SIZE_BYTES,
  };

  const { data: buckets, error: listError } = await admin.storage.listBuckets();

  if (listError) {
    throw new Error(`Не удалось получить список бакетов: ${listError.message}`);
  }

  const existing = buckets.find((item) => item.name === bucket);

  if (!existing) {
    const { error } = await admin.storage.createBucket(bucket, settings);

    if (error) {
      throw new Error(`Не удалось создать бакет ${bucket}: ${error.message}`);
    }

    console.log(`Бакет ${bucket} создан (приватный, лимит ${settings.fileSizeLimit} байт)`);
    return;
  }

  const { error } = await admin.storage.updateBucket(bucket, settings);

  if (error) {
    throw new Error(`Не удалось обновить бакет ${bucket}: ${error.message}`);
  }

  console.log(`Бакет ${bucket} уже есть, настройки приведены к нужным`);
}

await main();
