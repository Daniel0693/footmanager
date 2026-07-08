// Aides de date partagées par les vues Mensuelle et Hebdomadaire du
// calendrier (docs/roadmap.md, étapes B5/B6) — pas de bibliothèque de
// dates dans ce projet, cohérent avec le reste de l'app (Date native).

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function toDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function addDays(date: Date, delta: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + delta);
  return result;
}

export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

// Lundi = début de semaine (convention française).
export function startOfWeek(date: Date): Date {
  const weekday = (date.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - weekday);
}

// Un événement dont startAt/endAt tombent sur des jours calendaires
// différents (vue Mensuelle : bandeau qui s'étend sur les jours concernés ;
// vue Hebdomadaire : bandeau au-dessus de la grille horaire).
export function isMultiDay(event: { startAt: string; endAt: string | null }): boolean {
  return !!event.endAt && !isSameDay(new Date(event.startAt), new Date(event.endAt));
}

// Numéro de semaine ISO 8601 (semaine du jeudi — algorithme standard),
// affiché dans la gouttière de la vue Mensuelle.
export function getIsoWeekNumber(date: Date): number {
  const thursday = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = (thursday.getUTCDay() + 6) % 7;
  thursday.setUTCDate(thursday.getUTCDate() - weekday + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstWeekday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstWeekday + 3);
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}
