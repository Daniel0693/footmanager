-- AlterTable
ALTER TABLE "MatchLineup" ADD COLUMN     "pitchSpotId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "MatchLineup_matchId_pitchSpotId_key" ON "MatchLineup"("matchId", "pitchSpotId");
