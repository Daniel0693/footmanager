export interface DedupablePlayerTeamAssignment {
  id: number;
  playerId: number;
  joinDate: Date | null;
}

/**
 * Un joueur peut avoir plusieurs affectations `PlayerTeam` ACTIVES
 * (`leaveDate: null`) simultanément sur la même équipe pendant la fenêtre du
 * wizard de saison — import du roster avant activation (voir
 * docs/modules/saisons-championnats.md, SeasonRosterImportService) — un état
 * qui n'existait pas avant le module Saisons (`PlayerTeamsService.create()`
 * empêche normalement une seconde affectation active). Toute liste
 * "affectations actives actuelles" doit donc dédoublonner par joueur —
 * effectif (RosterService) autant que l'aperçu d'import du wizard — sinon un
 * joueur reconduit apparaît deux fois tant que la saison n'est pas activée.
 *
 * Ne s'applique volontairement qu'aux affectations ACTIVES : les
 * affectations archivées (plusieurs par joueur au fil des saisons, par
 * construction) ne doivent jamais être dédoublonnées, c'est l'historique
 * attendu (docs/modules/saisons-championnats.md §Historique).
 *
 * Retient l'affectation la plus récente (`joinDate` le plus tardif, `id` le
 * plus élevé en dernier recours si `joinDate` est identique ou absent).
 */
export function dedupeByMostRecentAssignment<
  T extends DedupablePlayerTeamAssignment,
>(assignments: T[]): T[] {
  const byPlayer = new Map<number, T>();
  for (const assignment of assignments) {
    const existing = byPlayer.get(assignment.playerId);
    if (!existing || isMoreRecentAssignment(assignment, existing)) {
      byPlayer.set(assignment.playerId, assignment);
    }
  }
  return [...byPlayer.values()];
}

function isMoreRecentAssignment<T extends DedupablePlayerTeamAssignment>(
  candidate: T,
  current: T,
): boolean {
  if (candidate.joinDate && current.joinDate) {
    return candidate.joinDate > current.joinDate;
  }
  if (candidate.joinDate && !current.joinDate) return true;
  if (!candidate.joinDate && current.joinDate) return false;
  return candidate.id > current.id;
}
