-- CreateEnum
CREATE TYPE "ExtractionKind" AS ENUM ('TENDER', 'CONTRACT');

-- CreateTable
CREATE TABLE "AiExtraction" (
    "id" TEXT NOT NULL,
    "kind" "ExtractionKind" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "result" JSONB NOT NULL,
    "documentIds" TEXT[],
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "opportunityId" TEXT,
    "projectId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "AiExtraction_pkey" PRIMARY KEY ("id")
);
