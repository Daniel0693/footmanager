-- CreateTable
CREATE TABLE "PlayerInterview" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "staffId" INTEGER,
    "date" DATE NOT NULL,
    "subject" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "staffFeedback" TEXT NOT NULL,
    "playerFeedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerInterview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerInterview_playerId_idx" ON "PlayerInterview"("playerId");

-- AddForeignKey
ALTER TABLE "PlayerInterview" ADD CONSTRAINT "PlayerInterview_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerInterview" ADD CONSTRAINT "PlayerInterview_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
