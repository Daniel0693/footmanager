"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { CompositionColumn } from "@/components/matches/composition-column";
import { ConvocationsTab } from "@/components/matches/convocations-tab";

// Onglet Avant-match (docs/modules/matchs.md §Convocations/Composition, B6)
// — fusion des anciens onglets Convocations et Composition (décision du
// 2026-07-17) : deux colonnes côte à côte, la seconde se peuple
// automatiquement depuis les convocations acceptées de la première. Les deux
// colonnes restent des composants indépendants, chacun gérant son propre
// fetch (convention du projet) — `refreshKey`, incrémenté à chaque
// rechargement réussi des convocations (`ConvocationsTab.onChange`), permet
// à la Composition de rester synchronisée sans dupliquer l'état des
// convocations dans ce composant parent.
export function PreMatchTab({
  clubId,
  teamId,
  matchId,
}: {
  clubId: string;
  teamId: string;
  matchId: string;
}) {
  const t = useTranslations("matchDetail");
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefreshKey = useCallback(() => setRefreshKey((key) => key + 1), []);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">{t("convocationsHeading")}</h2>
        <ConvocationsTab
          clubId={clubId}
          teamId={teamId}
          matchId={matchId}
          onChange={bumpRefreshKey}
        />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">{t("compositionHeading")}</h2>
        <CompositionColumn
          clubId={clubId}
          teamId={teamId}
          matchId={matchId}
          refreshKey={refreshKey}
        />
      </div>
    </div>
  );
}
