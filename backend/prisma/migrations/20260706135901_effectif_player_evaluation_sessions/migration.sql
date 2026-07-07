/*
  Warnings:

  - You are about to drop the column `criterionId` on the `PlayerEvaluation` table. All the data in the column will be lost.
  - You are about to drop the column `score` on the `PlayerEvaluation` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "PlayerEvaluation" DROP CONSTRAINT "PlayerEvaluation_criterionId_fkey";

-- AlterTable
ALTER TABLE "PlayerEvaluation" DROP COLUMN "criterionId",
DROP COLUMN "score";

-- CreateTable
CREATE TABLE "PlayerEvaluationScore" (
    "id" SERIAL NOT NULL,
    "evaluationId" INTEGER NOT NULL,
    "criterionId" INTEGER NOT NULL,
    "score" DECIMAL(4,1) NOT NULL,

    CONSTRAINT "PlayerEvaluationScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerEvaluationScore_evaluationId_idx" ON "PlayerEvaluationScore"("evaluationId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerEvaluationScore_evaluationId_criterionId_key" ON "PlayerEvaluationScore"("evaluationId", "criterionId");

-- AddForeignKey
ALTER TABLE "PlayerEvaluationScore" ADD CONSTRAINT "PlayerEvaluationScore_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "PlayerEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerEvaluationScore" ADD CONSTRAINT "PlayerEvaluationScore_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "EvaluationCriterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
