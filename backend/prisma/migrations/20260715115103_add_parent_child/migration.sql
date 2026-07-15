-- AlterEnum
ALTER TYPE "PermissionScope" ADD VALUE 'PARENT';

-- CreateTable
CREATE TABLE "ParentChild" (
    "id" SERIAL NOT NULL,
    "parentMemberId" INTEGER NOT NULL,
    "childMemberId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentChild_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParentChild_parentMemberId_idx" ON "ParentChild"("parentMemberId");

-- CreateIndex
CREATE INDEX "ParentChild_childMemberId_idx" ON "ParentChild"("childMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentChild_parentMemberId_childMemberId_key" ON "ParentChild"("parentMemberId", "childMemberId");

-- AddForeignKey
ALTER TABLE "ParentChild" ADD CONSTRAINT "ParentChild_parentMemberId_fkey" FOREIGN KEY ("parentMemberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentChild" ADD CONSTRAINT "ParentChild_childMemberId_fkey" FOREIGN KEY ("childMemberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
