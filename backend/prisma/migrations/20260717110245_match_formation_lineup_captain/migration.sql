-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "formation" TEXT;

-- AlterTable
ALTER TABLE "MatchLineup" ADD COLUMN     "isCaptain" BOOLEAN NOT NULL DEFAULT false;
