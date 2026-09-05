-- Notification.orderId переводится с ON DELETE CASCADE на ON DELETE SET NULL.
--
-- С каскадом уведомление «заказ удалён» удалялось бы той же операцией, которая
-- его породила: компания не узнала бы, куда делось её предложение. Поле orderId
-- и так необязательное (ТЗ §3), а номер и название заказа остаются в тексте
-- уведомления — читать его без ссылки можно.
--
-- Прочие уведомления по удалённому заказу тоже переживают удаление и остаются
-- в истории без ссылки. Это осознанно: они описывают то, что действительно
-- произошло, а «Заказ не найден» по клику — не поломка, а отсутствие заказа.

ALTER TABLE "Notification" DROP CONSTRAINT "Notification_orderId_fkey";

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
