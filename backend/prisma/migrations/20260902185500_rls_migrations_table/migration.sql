-- ТЗ §6 требует RLS на всех таблицах схемы public. Служебная таблица
-- _prisma_migrations создаётся самой Prisma и в предыдущую миграцию попасть
-- не могла. В Supabase она тоже подпадает под default privileges для роли
-- anon, то есть история миграций читалась бы публичным ключом из браузера.
--
-- Владелец таблицы RLS не подчиняется, поэтому миграции Prisma продолжают
-- работать.
--
-- Проверка на существование нужна для shadow-базы: Prisma прогоняет миграции
-- на чистой базе, где своей служебной таблицы ещё нет.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = '_prisma_migrations'
  ) THEN
    EXECUTE 'ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
