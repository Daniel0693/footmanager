-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "Foot" AS ENUM ('LEFT', 'RIGHT', 'BOTH');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "gender" "Gender";

-- AlterTable
ALTER TABLE "PlayerProfile" ADD COLUMN     "preferredFoot" "Foot";
