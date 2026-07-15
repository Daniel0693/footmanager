export interface DateRange {
  startDate: Date | null;
  endDate: Date | null;
}

/**
 * Fenêtre d'activité partagée par `MemberRole` et `UserRole`
 * (docs/schema/fondations.md) : actif si la date courante est dans
 * [startDate, endDate], bornes nullables ouvertes.
 */
export function isDateRangeActive(
  range: DateRange,
  now: Date = new Date(),
): boolean {
  if (range.startDate && range.startDate > now) return false;
  if (range.endDate && range.endDate < now) return false;
  return true;
}
