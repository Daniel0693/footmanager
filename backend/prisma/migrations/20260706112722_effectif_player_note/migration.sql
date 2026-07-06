-- CreateEnum
CREATE TYPE "NoteVisibility" AS ENUM ('PRIVE', 'SEMI_PRIVE', 'PUBLIC');

-- CreateTable
CREATE TABLE "PlayerNote" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "visibility" "NoteVisibility" NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerNote_playerId_idx" ON "PlayerNote"("playerId");

-- AddForeignKey
ALTER TABLE "PlayerNote" ADD CONSTRAINT "PlayerNote_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerNote" ADD CONSTRAINT "PlayerNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
