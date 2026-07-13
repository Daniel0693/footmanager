// Statuts d'une Season (docs/schema/championnats.md — enum SeasonStatus).
// Libellés exclusivement en i18n (clé seasons.status${value}) — jamais stockés
// ici, même pattern que lib/positions.ts.

export const SEASON_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;

export type SeasonStatus = (typeof SEASON_STATUSES)[number];

// L'ordre d'affichage (ACTIVE en premier, ARCHIVED en dernier) est résolu
// côté backend (SeasonsService.findAllByTeam) — le frontend affiche la liste
// telle que reçue, jamais de re-tri en JS ici (convention du projet).

export function seasonStatusBadgeVariant(
  status: SeasonStatus,
): "default" | "outline" | "secondary" {
  if (status === "ACTIVE") return "default";
  if (status === "DRAFT") return "outline";
  return "secondary";
}
