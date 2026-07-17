"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { CompositionColumn } from "@/components/matches/composition-column";
import { ConvocationsTab } from "@/components/matches/convocations-tab";

// Onglet Avant-match (docs/modules/matchs.md §Convocations/Composition,
// B6/B7) — fusion des anciens onglets Convocations et Composition (décision
// du 2026-07-17) : 3 colonnes côte à côte (Convocations/Composition/Banc,
// largeurs inégales — la colonne Convocations n'a besoin que d'une liste
// compacte, signalée trop large en pleine moitié de page). `CompositionColumn`
// retourne un fragment de 2 éléments (Composition + Banc, ce dernier isolé
// du terrain pour ne plus être "perdu" sous un terrain trop grand, autre
// retour utilisateur du même jour) — placés directement comme 2 des 3
// colonnes du grid. Les colonnes restent des composants indépendants,
// chacune gérant son propre fetch (convention du projet) — `refreshKey`,
// incrémenté à chaque rechargement réussi des convocations
// (`ConvocationsTab.onChange`), permet à la Composition/au Banc de rester
// synchronisés sans dupliquer l'état des convocations dans ce composant
// parent.
export function PreMatchTab({
  clubId,
  teamId,
  matchId,
  matchRefreshKey = 0,
}: {
  clubId: string;
  teamId: string;
  matchId: string;
  // Incrémenté par le parent (page détail du match) après modification du
  // match lui-même (MatchEditDialog, ex. changement de format de jeu, B11,
  // retour utilisateur du 2026-07-18) — combiné au compteur interne
  // (convocations) pour forcer CompositionColumn à recharger sans dupliquer
  // son état ici.
  matchRefreshKey?: number;
}) {
  const t = useTranslations("matchDetail");
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefreshKey = useCallback(() => setRefreshKey((key) => key + 1), []);

  return (
    // lg:h-full lg:min-h-0 sur le grid : borne sa hauteur à l'espace fourni
    // par TabsContent (page.tsx) plutôt que de suivre son contenu, sinon
    // aucune colonne ne peut défiler en interne (retour utilisateur du
    // 2026-07-17). La colonne Convocations (seule à défiler en interne, via
    // ConvocationsTab) reçoit le même relais lg:min-h-0 ; Composition/Banc
    // restent en flux normal (terrain de taille bornée, banc généralement
    // court).
    <div className="grid grid-cols-1 gap-6 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,0.8fr)]">
      <div className="flex flex-col gap-2 lg:min-h-0">
        <h2 className="shrink-0 text-base font-semibold">{t("convocationsHeading")}</h2>
        <ConvocationsTab
          clubId={clubId}
          teamId={teamId}
          matchId={matchId}
          onChange={bumpRefreshKey}
        />
      </div>
      <CompositionColumn
        clubId={clubId}
        teamId={teamId}
        matchId={matchId}
        refreshKey={refreshKey + matchRefreshKey}
      />
    </div>
  );
}
