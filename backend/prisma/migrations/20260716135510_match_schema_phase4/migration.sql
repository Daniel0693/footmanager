/*
  Warnings:

  - You are about to drop the column `matchId` on the `ChampionshipMatch` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('CHAMPIONNAT', 'COUPE', 'AMICAL', 'TOURNOI');

-- CreateEnum
CREATE TYPE "CupRound" AS ENUM ('ROUND_OF_64', 'ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL');

-- CreateEnum
CREATE TYPE "HomeOrAway" AS ENUM ('HOME', 'AWAY');

-- CreateEnum
CREATE TYPE "LiveMatchStatus" AS ENUM ('SCHEDULED', 'LIVE', 'HALFTIME', 'FINISHED', 'CANCELLED', 'POSTPONED');

-- AlterTable
ALTER TABLE "ChampionshipMatch" DROP COLUMN "matchId";

-- CreateTable
CREATE TABLE "Match" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "championshipMatchId" INTEGER,
    "matchType" "MatchType" NOT NULL,
    "opponentExternalTeamId" INTEGER,
    "cupRound" "CupRound",
    "homeOrAway" "HomeOrAway" NOT NULL,
    "status" "LiveMatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "numberOfPeriods" INTEGER,
    "periodDurationMinutes" INTEGER,
    "scoreHome" INTEGER,
    "scoreAway" INTEGER,
    "globalRating" DECIMAL(4,1),
    "globalComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Match_eventId_key" ON "Match"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Match_championshipMatchId_key" ON "Match"("championshipMatchId");

-- CreateIndex
CREATE INDEX "Match_opponentExternalTeamId_idx" ON "Match"("opponentExternalTeamId");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_championshipMatchId_fkey" FOREIGN KEY ("championshipMatchId") REFERENCES "ChampionshipMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_opponentExternalTeamId_fkey" FOREIGN KEY ("opponentExternalTeamId") REFERENCES "ExternalTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
