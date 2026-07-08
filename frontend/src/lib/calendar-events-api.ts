import { apiFetch } from "@/lib/api";
import type { ExistingEvent } from "@/components/calendar/event-form-dialog";
import type { EventType } from "@/lib/event";

export interface EventFilters {
  types: Set<EventType>;
  // null tant que "mes équipes" n'a pas encore répondu (voir CalendarPageContent).
  teamIds: Set<number> | null;
}

// teamIds reste `null` tant que "mes équipes" n'a pas répondu : aucune vue
// ne doit lancer de requête avant ce premier chargement (évite un aller-
// retour prématuré sans filtre équipe, voir CalendarPageContent).
export function isFiltersReady(filters: EventFilters): boolean {
  return filters.teamIds !== null;
}

// Case à cocher toutes décochées (type ou équipe) : calendrier vide sans
// aller-retour réseau, plutôt que de renvoyer "aucun filtre" au backend.
export function isEmptyFilterSelection(filters: EventFilters): boolean {
  return filters.types.size === 0 || filters.teamIds?.size === 0;
}

function toQueryString(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val) search.set(key, val);
  }
  return search.toString();
}

// Chaque vue (Liste/Mois/Semaine) borne sa propre requête à sa plage de
// dates affichée — jamais de chargement de tout l'historique/futur d'un
// coup (voir docs/roadmap.md étape B6, corrections post-revue).
export async function fetchCalendarEvents(
  clubId: string,
  accessToken: string | null | undefined,
  filters: EventFilters,
  range: { dateFrom: Date; dateTo: Date; sortOrder?: "asc" | "desc" },
): Promise<ExistingEvent[]> {
  const query = toQueryString({
    types: [...filters.types].join(","),
    teamIds: filters.teamIds ? [...filters.teamIds].join(",") : undefined,
    dateFrom: range.dateFrom.toISOString(),
    dateTo: range.dateTo.toISOString(),
    sortOrder: range.sortOrder ?? "asc",
  });
  const response = await apiFetch(`/clubs/${clubId}/events/mine?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error();
  return response.json();
}
