-- Déplace birthDate de PlayerProfile vers Member (docs/schema/fondations.md,
-- docs/schema/joueurs.md) : un Coach/Parent/AdminClub a aussi un anniversaire,
-- pas seulement un Player. Copie les valeurs existantes avant de supprimer la
-- colonne d'origine, dans une seule migration (ajout → copie → suppression).

-- AlterTable
ALTER TABLE "Member" ADD COLUMN "birthDate" DATE;

-- Copie des données existantes de PlayerProfile vers Member
UPDATE "Member" m
SET "birthDate" = pp."birthDate"
FROM "PlayerProfile" pp
WHERE pp."memberId" = m.id;

-- AlterTable
ALTER TABLE "PlayerProfile" DROP COLUMN "birthDate";
