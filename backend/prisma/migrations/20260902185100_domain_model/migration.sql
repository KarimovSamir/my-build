-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CLIENT', 'COMPANY');

-- CreateEnum
CREATE TYPE "OrderCategory" AS ENUM ('PLAN_CREATION', 'PLAN_IMPLEMENTATION');

-- CreateEnum
CREATE TYPE "ObjectType" AS ENUM ('APARTMENT', 'HOUSE', 'COMMERCIAL', 'GOVERNMENT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('WAITING', 'AWAITING_CONFIRMATION', 'IN_PROGRESS', 'AWAITING_COMPLETION_CONFIRMATION', 'COMPLETED', 'COMPLETION_DISPUTED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('SENT', 'ACCEPTED', 'REJECTED', 'NOT_ACCEPTED', 'WITHDRAWN', 'WORK_SUBMITTED', 'COMPLETED', 'BACK_FOR_OVERRIDE');

-- CreateEnum
CREATE TYPE "FileOwnerType" AS ENUM ('CLIENT', 'COMPANY');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('OFFER_RECEIVED', 'OFFER_ACCEPTED', 'OFFER_REJECTED', 'WORK_SUBMITTED', 'WORK_CONFIRMED', 'WORK_DISPUTED', 'FILES_UPDATED', 'AREA_VERIFIED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "phone" TEXT NOT NULL,
    "companyName" TEXT,
    "city" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "orderNumber" SERIAL NOT NULL,
    "clientId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" "OrderCategory" NOT NULL,
    "objectType" "ObjectType" NOT NULL,
    "description" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "squareMeters" DOUBLE PRECISION NOT NULL,
    "verifiedSquareMeters" DOUBLE PRECISION,
    "clientBudget" DECIMAL(12,2),
    "desiredStartDate" TIMESTAMP(3),
    "price" DECIMAL(12,2),
    "deadline" TIMESTAMP(3),
    "status" "OrderStatus" NOT NULL DEFAULT 'WAITING',
    "clientCompletionComment" TEXT,
    "correctionComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderFile" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "ownerType" "FileOwnerType" NOT NULL,
    "submissionRound" INTEGER NOT NULL DEFAULT 0,
    "fileHash" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'SENT',
    "comment" TEXT,
    "proposedPrice" DECIMAL(12,2) NOT NULL,
    "proposedDeadline" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "orderId" UUID,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCard" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "brand" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "expMonth" INTEGER NOT NULL,
    "expYear" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "providerToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "payerId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_clientId_status_idx" ON "Order"("clientId", "status");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OrderFile_orderId_ownerType_submissionRound_idx" ON "OrderFile"("orderId", "ownerType", "submissionRound");

-- CreateIndex
CREATE UNIQUE INDEX "OrderFile_orderId_submissionRound_fileHash_key" ON "OrderFile"("orderId", "submissionRound", "fileHash");

-- CreateIndex
CREATE INDEX "Offer_companyId_status_idx" ON "Offer"("companyId", "status");

-- CreateIndex
CREATE INDEX "Offer_orderId_status_idx" ON "Offer"("orderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_orderId_companyId_key" ON "Offer"("orderId", "companyId");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "UserCard_userId_idx" ON "UserCard"("userId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_payerId_idx" ON "Payment"("payerId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFile" ADD CONSTRAINT "OrderFile_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCard" ADD CONSTRAINT "UserCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (ТЗ §6): включаем на всех таблицах public и не заводим ни одной политики.
-- Prisma ходит в базу напрямую и RLS не подчиняется, а публичный anon-ключ
-- из браузера после этого не прочитает ни строки через Supabase REST.
-- Дописано вручную к сгенерированной миграции: Prisma этого не умеет.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderFile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Offer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserCard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
