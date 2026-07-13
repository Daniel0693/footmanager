-- Season devient club-wide (révision A14, docs/roadmap.md) : toutes les
-- équipes d'un club partagent le même calendrier de saisons. Les Season de
-- développement existantes (scopées équipe) sont réinitialisées plutôt que
-- migrées (choix assumé, confirmé par l'utilisateur — pas de mapping fiable
-- équipe→club pour des saisons créées avant cette révision).
DELETE FROM "Season";

-- DropForeignKey
ALTER TABLE "Season" DROP CONSTRAINT "Season_teamId_fkey";

-- DropIndex
DROP INDEX "Season_teamId_status_idx";

-- AlterTable
ALTER TABLE "Season"
  DROP COLUMN "teamId",
  DROP COLUMN "teamNameSnapshot",
  DROP COLUMN "categorySnapshot",
  ADD COLUMN "clubId" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "Season_clubId_status_idx" ON "Season"("clubId", "status");

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
