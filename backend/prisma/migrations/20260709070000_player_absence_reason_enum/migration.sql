-- CreateEnum
CREATE TYPE "AbsenceReason" AS ENUM ('INJURY', 'ILLNESS', 'VACATION', 'OTHER');

-- Le champ `reason` passe de texte libre à liste fermée (statistiques par
-- motif d'absence). Le texte déjà saisi n'est pas jetable : il est préservé
-- dans le nouveau champ `description`, et `reason` retombe sur 'OTHER' pour
-- les lignes existantes (aucun moyen fiable de deviner le motif depuis du
-- texte libre).
ALTER TABLE "PlayerAbsence" ADD COLUMN "description" TEXT;
ALTER TABLE "PlayerAbsence" ADD COLUMN "reason_new" "AbsenceReason";

UPDATE "PlayerAbsence" SET "description" = "reason", "reason_new" = 'OTHER';

ALTER TABLE "PlayerAbsence" ALTER COLUMN "reason_new" SET NOT NULL;
ALTER TABLE "PlayerAbsence" DROP COLUMN "reason";
ALTER TABLE "PlayerAbsence" RENAME COLUMN "reason_new" TO "reason";
