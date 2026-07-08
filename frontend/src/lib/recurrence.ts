import { addDays, startOfDay } from "@/lib/calendar-grid";

// Jour de semaine : 0 = lundi .. 6 = dimanche, même convention que le reste
// du calendrier (lib/calendar-grid.ts).
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const ORDINALS = [1, 2, 3, 4, -1] as const;
export type Ordinal = (typeof ORDINALS)[number];

export interface WeeklyRule {
  type: "weekly";
  weekdays: Weekday[];
}

export interface MonthlyDayOfMonthRule {
  type: "monthly";
  mode: "dayOfMonth";
  dayOfMonth: number; // 1-31
}

export interface MonthlyWeekdayOrdinalRule {
  type: "monthly";
  mode: "weekdayOrdinal";
  ordinal: Ordinal;
  weekday: Weekday;
}

export type MonthlyRule = MonthlyDayOfMonthRule | MonthlyWeekdayOrdinalRule;

export interface YearlyFixedDateRule {
  type: "yearly";
  mode: "fixedDate";
  month: number; // 1-12
  day: number; // 1-31
}

export interface YearlyWeekdayOrdinalRule {
  type: "yearly";
  mode: "weekdayOrdinal";
  ordinal: Ordinal;
  weekday: Weekday;
  month: number; // 1-12
}

export type YearlyRule = YearlyFixedDateRule | YearlyWeekdayOrdinalRule;

export type RecurrenceRule = WeeklyRule | MonthlyRule | YearlyRule;

// Garde-fou : au-delà, la génération est refusée côté formulaire plutôt que
// de créer silencieusement des centaines d'événements (le backend applique
// la même borne, voir CreateEventsBulkDto).
export const MAX_OCCURRENCES = 200;

function weekdayOf(date: Date): Weekday {
  return ((date.getDay() + 6) % 7) as Weekday;
}

// Ne renvoie une date que si elle "survit" à sa propre construction, c'est-
// à-dire si le jour demandé existe réellement dans ce mois (JS Date déborde
// silencieusement sur le mois suivant sinon, ex. new Date(2026, 1, 30) →
// 2 mars 2026).
function safeDate(year: number, monthIndex: number, day: number): Date | null {
  const date = new Date(year, monthIndex, day);
  return date.getMonth() === ((monthIndex % 12) + 12) % 12 ? date : null;
}

// Nième (ou dernière si ordinal = -1) occurrence d'un jour de semaine dans
// un mois donné — null si ce mois n'a pas de 5e occurrence de ce jour.
function nthWeekdayOfMonth(
  year: number,
  monthIndex: number,
  weekday: Weekday,
  ordinal: Ordinal,
): Date | null {
  if (ordinal === -1) {
    const lastDayOfMonth = new Date(year, monthIndex + 1, 0);
    const diff = (weekdayOf(lastDayOfMonth) - weekday + 7) % 7;
    return addDays(lastDayOfMonth, -diff);
  }
  const firstDayOfMonth = new Date(year, monthIndex, 1);
  const diff = (weekday - weekdayOf(firstDayOfMonth) + 7) % 7;
  const firstOccurrence = addDays(firstDayOfMonth, diff);
  const result = addDays(firstOccurrence, (ordinal - 1) * 7);
  return result.getMonth() === firstDayOfMonth.getMonth() ? result : null;
}

function withinRange(date: Date, rangeStart: Date, rangeEnd: Date): boolean {
  return date >= rangeStart && date <= rangeEnd;
}

/**
 * Calcule les dates d'occurrence d'une règle de récurrence entre deux
 * bornes incluses (docs/roadmap.md — recurrence). Ne tient compte que de la
 * date ; l'heure de chaque occurrence est appliquée séparément par
 * l'appelant (voir EventFormDialog, même heure de début/fin pour toutes les
 * occurrences).
 */
export function computeOccurrenceDates(
  rule: RecurrenceRule,
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  const start = startOfDay(rangeStart);
  const end = startOfDay(rangeEnd);
  if (start > end) return [];

  const dates: Date[] = [];

  if (rule.type === "weekly") {
    for (let day = start; day <= end; day = addDays(day, 1)) {
      if (rule.weekdays.includes(weekdayOf(day))) {
        dates.push(day);
      }
      if (dates.length > MAX_OCCURRENCES) break;
    }
    return dates;
  }

  if (rule.type === "monthly") {
    let cursorYear = start.getFullYear();
    let cursorMonth = start.getMonth();
    const endYear = end.getFullYear();
    const endMonth = end.getMonth();
    while (cursorYear < endYear || (cursorYear === endYear && cursorMonth <= endMonth)) {
      const occurrence =
        rule.mode === "dayOfMonth"
          ? safeDate(cursorYear, cursorMonth, rule.dayOfMonth)
          : nthWeekdayOfMonth(cursorYear, cursorMonth, rule.weekday, rule.ordinal);
      if (occurrence && withinRange(occurrence, start, end)) {
        dates.push(occurrence);
      }
      if (dates.length > MAX_OCCURRENCES) break;
      cursorMonth += 1;
      if (cursorMonth > 11) {
        cursorMonth = 0;
        cursorYear += 1;
      }
    }
    return dates;
  }

  // yearly
  for (let year = start.getFullYear(); year <= end.getFullYear(); year += 1) {
    const monthIndex = rule.month - 1;
    const occurrence =
      rule.mode === "fixedDate"
        ? safeDate(year, monthIndex, rule.day)
        : nthWeekdayOfMonth(year, monthIndex, rule.weekday, rule.ordinal);
    if (occurrence && withinRange(occurrence, start, end)) {
      dates.push(occurrence);
    }
    if (dates.length > MAX_OCCURRENCES) break;
  }
  return dates;
}
