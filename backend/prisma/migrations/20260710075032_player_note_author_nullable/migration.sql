-- DropForeignKey
ALTER TABLE "PlayerNote" DROP CONSTRAINT "PlayerNote_authorId_fkey";

-- AlterTable
ALTER TABLE "PlayerNote" ALTER COLUMN "authorId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "PlayerNote" ADD CONSTRAINT "PlayerNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
