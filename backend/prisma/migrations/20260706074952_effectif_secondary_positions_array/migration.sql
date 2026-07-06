-- Un joueur peut couvrir plusieurs postes secondaires : remplace la colonne
-- scalaire nullable par un tableau, avec reprise des données existantes.
ALTER TABLE "PlayerTeam" ADD COLUMN "secondaryPositions" "Position"[] NOT NULL DEFAULT ARRAY[]::"Position"[];

UPDATE "PlayerTeam"
SET "secondaryPositions" = ARRAY["secondaryPosition"]
WHERE "secondaryPosition" IS NOT NULL;

ALTER TABLE "PlayerTeam" DROP COLUMN "secondaryPosition";
