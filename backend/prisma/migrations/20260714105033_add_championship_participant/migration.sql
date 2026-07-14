-- CreateTable
CREATE TABLE "ChampionshipParticipant" (
    "id" SERIAL NOT NULL,
    "championshipId" INTEGER NOT NULL,
    "internalTeamId" INTEGER,
    "externalTeamId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChampionshipParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChampionshipParticipant_championshipId_idx" ON "ChampionshipParticipant"("championshipId");

-- AddForeignKey
ALTER TABLE "ChampionshipParticipant" ADD CONSTRAINT "ChampionshipParticipant_championshipId_fkey" FOREIGN KEY ("championshipId") REFERENCES "Championship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChampionshipParticipant" ADD CONSTRAINT "ChampionshipParticipant_internalTeamId_fkey" FOREIGN KEY ("internalTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChampionshipParticipant" ADD CONSTRAINT "ChampionshipParticipant_externalTeamId_fkey" FOREIGN KEY ("externalTeamId") REFERENCES "ExternalTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
