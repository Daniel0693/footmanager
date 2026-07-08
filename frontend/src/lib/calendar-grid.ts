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

// Lundi = début de semaine (convention française).
export function startOfWeek(date: Date): Date {
  const weekday = (date.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - weekday);
}
