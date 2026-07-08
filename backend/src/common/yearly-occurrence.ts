// Portage minimal de la branche "yearly / fixedDate" de
// frontend/src/lib/recurrence.ts (computeOccurrenceDates) — calcule les
// dates d'anniversaire (mois/jour fixes, année ignorée) dans [rangeStart,
// rangeEnd]. Pas de partage de code entre backend et frontend (deux projets
// npm séparés) : réimplémentation volontaire plutôt qu'une abstraction
// prématurée pour ~15 lignes.

// Ne renvoie une date que si elle "survit" à sa propre construction — le 29
// février d'une année non bissextile n'a pas d'occurrence cette année-là
// (JS Date déborde silencieusement sur le mois suivant sinon).
function safeDate(year: number, monthIndex: number, day: number): Date | null {
  const date = new Date(year, monthIndex, day);
  return date.getMonth() === monthIndex ? date : null;
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Occurrences d'un anniversaire (mois/jour fixes) entre deux bornes
 * incluses. `birthDate` ne fournit que le mois/jour — l'année de naissance
 * sert uniquement au calcul de l'âge par l'appelant.
 */
export function computeYearlyOccurrences(
  birthDate: Date,
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  const start = startOfDay(rangeStart);
  const end = startOfDay(rangeEnd);
  if (start > end) return [];

  const month = birthDate.getUTCMonth();
  const day = birthDate.getUTCDate();
  const dates: Date[] = [];

  for (let year = start.getFullYear(); year <= end.getFullYear(); year += 1) {
    const occurrence = safeDate(year, month, day);
    if (occurrence && occurrence >= start && occurrence <= end) {
      dates.push(occurrence);
    }
  }
  return dates;
}
