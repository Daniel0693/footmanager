-- CreateTable
CREATE TABLE "ExternalTeam" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalTeam_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalTeam_clubId_idx" ON "ExternalTeam"("clubId");

-- AddForeignKey
ALTER TABLE "ExternalTeam" ADD CONSTRAINT "ExternalTeam_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
