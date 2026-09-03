/**
 * Настройки подключения к Supabase Auth.
 *
 * Оба значения публичные и попадают в браузер намеренно: по публикуемому ключу
 * нельзя прочитать ни одной таблицы — на всех включён RLS без политик (ТЗ §6).
 * Секретный ключ здесь появиться не должен никогда.
 *
 * Переменные читаются целиком, а не через переменную-ключ: Next.js подставляет
 * значения `NEXT_PUBLIC_*` в бандл на этапе сборки только при прямом обращении.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Проверка при первом обращении: пустой .env иначе даёт непонятную ошибку сети. */
export function supabaseCredentials(): { url: string; key: string } {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      'Не заданы NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ' +
        'в frontend/.env.local (шаблон — frontend/env.example)',
    );
  }

  return { url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY };
}
