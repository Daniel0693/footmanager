-- CreateEnum
CREATE TYPE "TeamCategory" AS ENUM ('U9', 'U11', 'U13', 'U15', 'U17', 'U19', 'SENIORS');

-- CreateEnum
CREATE TYPE "GameFormat" AS ENUM ('FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'ELEVEN');

-- AlterTable
ALTER TABLE "Championship" ADD COLUMN     "gameFormat" "GameFormat" NOT NULL DEFAULT 'ELEVEN';

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "gameFormat" "GameFormat";

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "category" "TeamCategory";
