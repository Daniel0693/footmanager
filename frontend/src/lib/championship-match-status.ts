// Statuts d'un ChampionshipMatch (docs/schema/championnats.md — enum
// ChampionshipMatchStatus). Libellés exclusivement en i18n (clé
// championshipMatches.status.${value}) — jamais stockés ici, même pattern
// que lib/season-status.ts.

export const CHAMPIONSHIP_MATCH_STATUSES = [
  "SCHEDULED",
  "FINISHED",
  "CANCELLED",
  "POSTPONED",
] as const;

export type ChampionshipMatchStatus = (typeof CHAMPIONSHIP_MATCH_STATUSES)[number];

export function championshipMatchStatusBadgeVariant(
  status: ChampionshipMatchStatus,
): "default" | "outline" | "secondary" | "destructive" {
  if (status === "FINISHED") return "default";
  if (status === "SCHEDULED") return "outline";
  if (status === "CANCELLED") return "destructive";
  return "secondary";
}
