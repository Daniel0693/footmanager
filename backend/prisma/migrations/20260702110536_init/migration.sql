-- CreateEnum
CREATE TYPE "SportType" AS ENUM ('FOOTBALL', 'BASKETBALL', 'RUGBY', 'HANDBALL', 'VOLLEYBALL');

-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM ('READ', 'CREATE', 'UPDATE', 'DELETE');

-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('OWN', 'TEAM', 'CLUB', 'ALL');

-- CreateEnum
CREATE TYPE "ScoutingDimension" AS ENUM ('PHYSIQUE', 'TECHNIQUE', 'TACTIQUE', 'MENTAL');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Club" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sport" "SportType" NOT NULL DEFAULT 'FOOTBALL',
    "logoUrl" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "country" TEXT NOT NULL,
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "clubId" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL,
    "clubId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberRole" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "clubId" INTEGER,
    "teamId" INTEGER,
    "startDate" DATE,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" SERIAL NOT NULL,
    "resource" TEXT NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "scope" "PermissionScope" NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" INTEGER NOT NULL,
    "permissionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "EvaluationCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL,
    "sport" "SportType",
    "defaultDisplayOrder" INTEGER NOT NULL,
    "clubId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubEvaluationConfig" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER,
    "customName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubEvaluationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationCriterion" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "isSystem" BOOLEAN NOT NULL,
    "clubId" INTEGER,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayingStyleTag" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL,
    "clubId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayingStyleTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerScoutingCriterion" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "dimension" "ScoutingDimension" NOT NULL,
    "isSystem" BOOLEAN NOT NULL,
    "clubId" INTEGER,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerScoutingCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "Team_clubId_idx" ON "Team"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_userId_clubId_key" ON "Member"("userId", "clubId");

-- CreateIndex
CREATE INDEX "MemberRole_memberId_idx" ON "MemberRole"("memberId");

-- CreateIndex
CREATE INDEX "MemberRole_clubId_teamId_idx" ON "MemberRole"("clubId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_resource_action_scope_key" ON "Permission"("resource", "action", "scope");

-- CreateIndex
CREATE INDEX "EvaluationCategory_clubId_idx" ON "EvaluationCategory"("clubId");

-- CreateIndex
CREATE INDEX "ClubEvaluationConfig_clubId_idx" ON "ClubEvaluationConfig"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubEvaluationConfig_clubId_categoryId_key" ON "ClubEvaluationConfig"("clubId", "categoryId");

-- CreateIndex
CREATE INDEX "EvaluationCriterion_categoryId_idx" ON "EvaluationCriterion"("categoryId");

-- CreateIndex
CREATE INDEX "PlayingStyleTag_clubId_idx" ON "PlayingStyleTag"("clubId");

-- CreateIndex
CREATE INDEX "PlayerScoutingCriterion_clubId_idx" ON "PlayerScoutingCriterion"("clubId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberRole" ADD CONSTRAINT "MemberRole_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberRole" ADD CONSTRAINT "MemberRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberRole" ADD CONSTRAINT "MemberRole_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberRole" ADD CONSTRAINT "MemberRole_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCategory" ADD CONSTRAINT "EvaluationCategory_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubEvaluationConfig" ADD CONSTRAINT "ClubEvaluationConfig_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubEvaluationConfig" ADD CONSTRAINT "ClubEvaluationConfig_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EvaluationCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCriterion" ADD CONSTRAINT "EvaluationCriterion_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EvaluationCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCriterion" ADD CONSTRAINT "EvaluationCriterion_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayingStyleTag" ADD CONSTRAINT "PlayingStyleTag_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerScoutingCriterion" ADD CONSTRAINT "PlayerScoutingCriterion_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;
