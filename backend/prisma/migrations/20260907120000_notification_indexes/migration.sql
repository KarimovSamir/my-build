-- Индексы Notification: порядок списка и внешний ключ на заказ.
--
-- 1. Список уведомлений сортируется «непрочитанные сверху, внутри группы новые
--    первыми» (ТЗ §5), то есть ORDER BY "isRead" ASC, "createdAt" DESC. Btree
--    сканируется либо вперёд, либо назад целиком, поэтому индекс со всеми
--    колонками ASC такой порядок не покрывает: строки приходилось досортировывать
--    в памяти. Пересоздаём его с обратным направлением у "createdAt".
--
-- 2. У "orderId" индекса не было вовсе, а внешний ключ переведён на
--    ON DELETE SET NULL: при удалении заказа Postgres ищет ссылающиеся строки,
--    и без индекса это чтение всей таблицы под блокировкой строки заказа.

DROP INDEX "Notification_userId_isRead_createdAt_idx";

CREATE INDEX "Notification_userId_isRead_createdAt_idx"
  ON "Notification"("userId", "isRead", "createdAt" DESC);

CREATE INDEX "Notification_orderId_idx" ON "Notification"("orderId");
