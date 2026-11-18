-- CreateEnum
CREATE TYPE "LibraryKind" AS ENUM ('PAST_PROPOSAL', 'FIN_TEMPLATE', 'COMPANY_PROFILE', 'OTHER');

-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('FEES', 'TRAVEL', 'PER_DIEM', 'OTHER');

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "finNotes" TEXT,
ADD COLUMN     "finTaxRate" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "LibraryItem" (
    "id" TEXT NOT NULL,
    "kind" "LibraryKind" NOT NULL DEFAULT 'PAST_PROPOSAL',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT,
    "fileName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER NOT NULL,
    "textContent" TEXT,
    "source" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expert" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "nationality" TEXT,
    "yearsExperience" INTEGER,
    "expertise" TEXT,
    "languages" TEXT,
    "education" TEXT,
    "summary" TEXT,
    "keyProjects" TEXT,
    "dailyRate" DECIMAL(12,2),
    "rateCurrency" TEXT NOT NULL DEFAULT 'USD',
    "isStaff" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "cvFileName" TEXT,
    "cvStoredName" TEXT,
    "cvText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reference" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "country" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "value" DECIMAL(16,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "services" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalSection" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "guidance" TEXT,
    "content" TEXT NOT NULL DEFAULT '',
    "aiModel" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalTeamMember" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "expertId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "isKey" BOOLEAN NOT NULL DEFAULT true,
    "inputDays" DECIMAL(8,1),
    "seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProposalTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalReference" (
    "opportunityId" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProposalReference_pkey" PRIMARY KEY ("opportunityId","referenceId")
);

-- CreateTable
CREATE TABLE "FinancialLine" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "category" "CostCategory" NOT NULL DEFAULT 'FEES',
    "description" TEXT NOT NULL,
    "expertId" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'day',
    "quantity" DECIMAL(12,2) NOT NULL,
    "rate" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "FinancialLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reference_projectId_key" ON "Reference"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalTeamMember_opportunityId_expertId_position_key" ON "ProposalTeamMember"("opportunityId", "expertId", "position");

-- AddForeignKey
ALTER TABLE "ProposalSection" ADD CONSTRAINT "ProposalSection_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalTeamMember" ADD CONSTRAINT "ProposalTeamMember_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalTeamMember" ADD CONSTRAINT "ProposalTeamMember_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "Expert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalReference" ADD CONSTRAINT "ProposalReference_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalReference" ADD CONSTRAINT "ProposalReference_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "Reference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialLine" ADD CONSTRAINT "FinancialLine_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialLine" ADD CONSTRAINT "FinancialLine_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "Expert"("id") ON DELETE SET NULL ON UPDATE CASCADE;
