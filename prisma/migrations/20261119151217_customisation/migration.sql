-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "custom" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Deliverable" ADD COLUMN     "custom" JSONB NOT NULL DEFAULT '{}';
-- keep existing values: enum → text in place
ALTER TABLE "Deliverable" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Deliverable" ALTER COLUMN "type" TYPE TEXT USING "type"::text;
ALTER TABLE "Deliverable" ALTER COLUMN "type" SET DEFAULT 'DOCUMENT';

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "custom" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "custom" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "WorkItem" ADD COLUMN     "custom" JSONB NOT NULL DEFAULT '{}';

-- DropEnum
DROP TYPE "DeliverableType";

-- CreateTable
CREATE TABLE "WorkLabel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'gray',
    "seq" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WorkLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionItem" (
    "id" TEXT NOT NULL,
    "list" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "OptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomField" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" TEXT[],
    "help" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "showInList" BOOLEAN NOT NULL DEFAULT false,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_WorkItemToWorkLabel" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_WorkItemToWorkLabel_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkLabel_name_key" ON "WorkLabel"("name");

-- CreateIndex
CREATE UNIQUE INDEX "OptionItem_list_value_key" ON "OptionItem"("list", "value");

-- CreateIndex
CREATE INDEX "CustomField_entity_active_idx" ON "CustomField"("entity", "active");

-- CreateIndex
CREATE INDEX "_WorkItemToWorkLabel_B_index" ON "_WorkItemToWorkLabel"("B");

-- AddForeignKey
ALTER TABLE "_WorkItemToWorkLabel" ADD CONSTRAINT "_WorkItemToWorkLabel_A_fkey" FOREIGN KEY ("A") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkItemToWorkLabel" ADD CONSTRAINT "_WorkItemToWorkLabel_B_fkey" FOREIGN KEY ("B") REFERENCES "WorkLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Default lists (admin can rename, reorder, add, retire)
INSERT INTO "OptionItem" ("id", "list", "value", "label", "seq") VALUES
  ('opt_dt_doc', 'deliverableType', 'DOCUMENT', 'Document / report', 0),
  ('opt_dt_rep', 'deliverableType', 'REPORT', 'Progress report', 1),
  ('opt_dt_sys', 'deliverableType', 'SYSTEM', 'System / software', 2),
  ('opt_dt_trn', 'deliverableType', 'TRAINING', 'Training / workshop', 3),
  ('opt_dt_dat', 'deliverableType', 'DATA', 'Data / dataset', 4),
  ('opt_dt_oth', 'deliverableType', 'OTHER', 'Other', 5),
  ('opt_is_eml', 'issueSource', 'EMAIL', 'Email', 0),
  ('opt_is_cal', 'issueSource', 'CALL', 'Phone call', 1),
  ('opt_is_mtg', 'issueSource', 'MEETING', 'Meeting', 2),
  ('opt_is_prt', 'issueSource', 'PORTAL', 'Client portal / system', 3),
  ('opt_is_oth', 'issueSource', 'OTHER', 'Other', 4);
