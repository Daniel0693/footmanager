-- CreateEnum
CREATE TYPE "ChampionshipMatchStatus" AS ENUM ('SCHEDULED', 'FINISHED', 'CANCELLED', 'POSTPONED');

-- CreateTable
CREATE TABLE "ChampionshipMatch" (
    "id" SERIAL NOT NULL,
    "championshipId" INTEGER NOT NULL,
    "homeParticipantId" INTEGER NOT NULL,
    "awayParticipantId" INTEGER NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "scoreHome" INTEGER,
    "scoreAway" INTEGER,
    "status" "ChampionshipMatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "matchId" INTEGER,
    "round" INTEGER,
    "numberOfPeriods" INTEGER,
    "periodDurationMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChampionshipMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChampionshipMatch_championshipId_idx" ON "ChampionshipMatch"("championshipId");

-- AddForeignKey
ALTER TABLE "ChampionshipMatch" ADD CONSTRAINT "ChampionshipMatch_championshipId_fkey" FOREIGN KEY ("championshipId") REFERENCES "Championship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChampionshipMatch" ADD CONSTRAINT "ChampionshipMatch_homeParticipantId_fkey" FOREIGN KEY ("homeParticipantId") REFERENCES "ChampionshipParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChampionshipMatch" ADD CONSTRAINT "ChampionshipMatch_awayParticipantId_fkey" FOREIGN KEY ("awayParticipantId") REFERENCES "ChampionshipParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
