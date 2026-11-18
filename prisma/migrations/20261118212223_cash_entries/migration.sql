-- CreateEnum
CREATE TYPE "CashKind" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "CashEntry" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amountInr" DECIMAL(16,2) NOT NULL,
    "kind" "CashKind" NOT NULL DEFAULT 'OUT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashEntry_pkey" PRIMARY KEY ("id")
);
