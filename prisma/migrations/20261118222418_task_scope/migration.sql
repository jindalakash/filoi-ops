-- Tasks now point at what the person writes: a section, the whole technical/financial proposal, the team, or other uploads.
ALTER TABLE "ProposalTask" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'SECTION';
ALTER TABLE "ProposalTask" ADD COLUMN "sectionId" TEXT;
ALTER TABLE "ProposalTask" ADD CONSTRAINT "ProposalTask_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ProposalSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- existing tasks: supporting-document parts are uploads, financial parts are the financial proposal
UPDATE "ProposalTask" SET "scope" = 'FINANCIAL' WHERE lower("title") LIKE '%financial%';
UPDATE "ProposalTask" SET "scope" = 'OTHER' WHERE lower("title") LIKE '%compliance%' OR lower("title") LIKE '%company document%' OR lower("title") LIKE '%final review%';
