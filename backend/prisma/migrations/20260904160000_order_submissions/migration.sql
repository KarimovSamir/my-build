-- Сдачи работы компании (ТЗ §4.1, подфаза 4.2).
--
-- ТЗ требует обязательный комментарий компании при добавлении файлов
-- (`POST /orders/:id/files`), но в доменной модели §3 хранить его негде:
-- comment у Offer относится к предложению, а оба текстовых поля Order —
-- клиентские. Отдельная строка на сдачу закрывает это и заодно отвечает,
-- какой сейчас номер раунда: по файлам его не вывести, раунд без файлов
-- сбил бы нумерацию.
--
-- Решение пользователя от 4 сентября 2026 (CLAUDE.md §7).

-- CreateTable
CREATE TABLE "OrderSubmission" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "round" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderSubmission_orderId_round_key" ON "OrderSubmission"("orderId", "round");

-- AddForeignKey
ALTER TABLE "OrderSubmission" ADD CONSTRAINT "OrderSubmission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (ТЗ §6): как и на всех таблицах public — включён, политик нет.
-- Прямой доступ браузера к таблицам запрещён, ходит только backend
-- сервисным ключом, а он RLS не подчиняется.
ALTER TABLE "OrderSubmission" ENABLE ROW LEVEL SECURITY;
