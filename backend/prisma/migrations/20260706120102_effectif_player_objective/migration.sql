-- CreateEnum
CREATE TYPE "ObjectiveTheme" AS ENUM ('TECHNIQUE', 'PHYSIQUE', 'MENTAL', 'TACTIQUE');

-- CreateEnum
CREATE TYPE "ObjectiveHorizon" AS ENUM ('SHORT_TERM', 'MID_TERM', 'LONG_TERM');

-- CreateEnum
CREATE TYPE "ObjectiveStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'ACHIEVED', 'FAILED');

-- CreateTable
CREATE TABLE "PlayerObjective" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "theme" "ObjectiveTheme" NOT NULL,
    "description" TEXT NOT NULL,
    "horizon" "ObjectiveHorizon" NOT NULL,
    "status" "ObjectiveStatus" NOT NULL DEFAULT 'PLANNED',
    "visibility" "NoteVisibility" NOT NULL DEFAULT 'SEMI_PRIVE',
    "startDate" DATE,
    "dueDate" DATE,
    "completedDate" DATE,
    "assignedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerObjective_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerObjective_playerId_idx" ON "PlayerObjective"("playerId");

-- AddForeignKey
ALTER TABLE "PlayerObjective" ADD CONSTRAINT "PlayerObjective_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerObjective" ADD CONSTRAINT "PlayerObjective_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
