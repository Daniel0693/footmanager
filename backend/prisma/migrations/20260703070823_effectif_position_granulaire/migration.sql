-- AlterEnum
BEGIN;
CREATE TYPE "Position_new" AS ENUM ('GK', 'CB', 'RB', 'LB', 'RWB', 'LWB', 'CDM', 'CM', 'RM', 'LM', 'CAM', 'RW', 'LW', 'CF', 'ST');
ALTER TABLE "PlayerTeam" ALTER COLUMN "mainPosition" TYPE "Position_new" USING ("mainPosition"::text::"Position_new");
ALTER TABLE "PlayerTeam" ALTER COLUMN "secondaryPosition" TYPE "Position_new" USING ("secondaryPosition"::text::"Position_new");
ALTER TYPE "Position" RENAME TO "Position_old";
ALTER TYPE "Position_new" RENAME TO "Position";
DROP TYPE "public"."Position_old";
COMMIT;
