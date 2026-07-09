-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "recurringGroupId" UUID;

-- CreateIndex
CREATE INDEX "Event_recurringGroupId_idx" ON "Event"("recurringGroupId");
