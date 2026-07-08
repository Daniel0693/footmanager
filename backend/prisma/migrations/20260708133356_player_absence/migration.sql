-- CreateTable
CREATE TABLE "PlayerAbsence" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isExcused" BOOLEAN,
    "reportedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerAbsence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerAbsence_playerId_startDate_idx" ON "PlayerAbsence"("playerId", "startDate");

-- AddForeignKey
ALTER TABLE "PlayerAbsence" ADD CONSTRAINT "PlayerAbsence_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerAbsence" ADD CONSTRAINT "PlayerAbsence_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
