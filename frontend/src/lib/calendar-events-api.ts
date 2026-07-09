import { apiFetch, authHeaders } from "@/lib/api";
import type { ExistingEvent } from "@/components/calendar/event-form-dialog";
import type { EventType } from "@/lib/event";
import { toQueryString } from "@/lib/query-string";

export interface EventFilters {
  types: Set<EventType>;
  // null tant que "mes équipes" n'a pas encore répondu (voir CalendarPageContent).
  teamIds: Set<number> | null;
  // Indépendant de `types` : un anniversaire n'est pas un EventType Prisma
  // (docs/modules/calendrier-evenements.md §Anniversaires) — jamais fusionné
  // dans ExistingEvent/EventType, voir event-form-dialog.tsx.
  showBirthdays: boolean;
}

export interface Birthday {
  memberId: number;
  firstName: string;
  lastName: string;
  date: string;
  age: number;
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
    headers: authHeaders(accessToken),
  });
  if (!response.ok) throw new Error();
  return response.json();
}

// Même fenêtre de dates que fetchCalendarEvents, appelée en parallèle par
// chaque vue (voir CalendarListView/MonthView/WeekView) — scope backend
// identique au reste du calendrier (club entier ou équipes accessibles),
// voir MembersService.findBirthdaysInClub.
export async function fetchBirthdayEvents(
  clubId: string,
  accessToken: string | null | undefined,
  range: { dateFrom: Date; dateTo: Date },
  teamIds: Set<number> | null,
): Promise<Birthday[]> {
  const query = toQueryString({
    teamIds: teamIds ? [...teamIds].join(",") : undefined,
    dateFrom: range.dateFrom.toISOString(),
    dateTo: range.dateTo.toISOString(),
  });
  const response = await apiFetch(`/clubs/${clubId}/members/birthdays?${query}`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) throw new Error();
  return response.json();
}
