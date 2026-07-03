-- CreateEnum
CREATE TYPE "Position" AS ENUM ('GK', 'DEF', 'MID', 'ATT');

-- CreateEnum
CREATE TYPE "TeamStaffRole" AS ENUM ('PRINCIPAL', 'CO_ENTRAINEUR', 'ADJOINT');

-- CreateTable
CREATE TABLE "PlayerProfile" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "licenseNumber" TEXT,
    "nationality" TEXT,
    "birthDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerTeam" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "jerseyNumber" INTEGER,
    "mainPosition" "Position",
    "secondaryPosition" "Position",
    "joinDate" DATE,
    "leaveDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamStaff" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,
    "staffRole" "TeamStaffRole" NOT NULL,
    "startDate" DATE,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamStaff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerProfile_memberId_key" ON "PlayerProfile"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerProfile_licenseNumber_key" ON "PlayerProfile"("licenseNumber");

-- CreateIndex
CREATE INDEX "PlayerTeam_playerId_idx" ON "PlayerTeam"("playerId");

-- CreateIndex
CREATE INDEX "PlayerTeam_teamId_idx" ON "PlayerTeam"("teamId");

-- CreateIndex
CREATE INDEX "TeamStaff_teamId_memberId_idx" ON "TeamStaff"("teamId", "memberId");

-- AddForeignKey
ALTER TABLE "PlayerProfile" ADD CONSTRAINT "PlayerProfile_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTeam" ADD CONSTRAINT "PlayerTeam_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTeam" ADD CONSTRAINT "PlayerTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamStaff" ADD CONSTRAINT "TeamStaff_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamStaff" ADD CONSTRAINT "TeamStaff_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
