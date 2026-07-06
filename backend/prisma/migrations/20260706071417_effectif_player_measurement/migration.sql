-- CreateEnum
CREATE TYPE "MeasurementType" AS ENUM ('HEIGHT', 'WEIGHT');

-- CreateTable
CREATE TABLE "PlayerMeasurement" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "type" "MeasurementType" NOT NULL,
    "value" DECIMAL(5,1) NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerMeasurement_playerId_idx" ON "PlayerMeasurement"("playerId");

-- AddForeignKey
ALTER TABLE "PlayerMeasurement" ADD CONSTRAINT "PlayerMeasurement_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
