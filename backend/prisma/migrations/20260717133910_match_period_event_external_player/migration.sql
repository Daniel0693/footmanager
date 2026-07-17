-- CreateEnum
CREATE TYPE "TeamSide" AS ENUM ('HOME', 'AWAY');

-- CreateEnum
CREATE TYPE "MatchEventType" AS ENUM ('GOAL', 'OWN_GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION', 'PENALTY_SCORED', 'PENALTY_MISSED');

-- CreateTable
CREATE TABLE "MatchPeriod" (
    "id" SERIAL NOT NULL,
    "matchId" INTEGER NOT NULL,
    "periodNumber" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchEvent" (
    "id" SERIAL NOT NULL,
    "matchId" INTEGER NOT NULL,
    "type" "MatchEventType" NOT NULL,
    "teamSide" "TeamSide" NOT NULL,
    "periodNumber" INTEGER,
    "minute" INTEGER,
    "playerId" INTEGER,
    "relatedPlayerId" INTEGER,
    "externalPlayerId" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalPlayer" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,
    "externalTeamId" INTEGER,
    "name" TEXT NOT NULL,
    "position" "Position",
    "shirtNumber" INTEGER,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchPeriod_matchId_idx" ON "MatchPeriod"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPeriod_matchId_periodNumber_key" ON "MatchPeriod"("matchId", "periodNumber");

-- CreateIndex
CREATE INDEX "MatchEvent_matchId_idx" ON "MatchEvent"("matchId");

-- CreateIndex
CREATE INDEX "ExternalPlayer_clubId_idx" ON "ExternalPlayer"("clubId");

-- CreateIndex
CREATE INDEX "ExternalPlayer_externalTeamId_idx" ON "ExternalPlayer"("externalTeamId");

-- AddForeignKey
ALTER TABLE "MatchPeriod" ADD CONSTRAINT "MatchPeriod_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_relatedPlayerId_fkey" FOREIGN KEY ("relatedPlayerId") REFERENCES "PlayerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_externalPlayerId_fkey" FOREIGN KEY ("externalPlayerId") REFERENCES "ExternalPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalPlayer" ADD CONSTRAINT "ExternalPlayer_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalPlayer" ADD CONSTRAINT "ExternalPlayer_externalTeamId_fkey" FOREIGN KEY ("externalTeamId") REFERENCES "ExternalTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

