// Statuts de convocation à un match (docs/schema/evenements.md — enum
// ConvocationStatus). Code couleur type feu tricolore — vert = confirmé,
// rouge = décliné (réutilise le variant Badge/Button "destructive" existant),
// gris = en attente — même pattern que lib/championship-match-status.ts pour
// le reste des statuts de l'appli.

export type ConvocationStatus = "PENDING" | "ACCEPTED" | "DECLINED";

export function convocationStatusColorClassName(status: ConvocationStatus): string {
  if (status === "ACCEPTED") {
    return "border-transparent bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-500/15 dark:text-green-400 dark:hover:bg-green-500/15";
  }
  if (status === "DECLINED") {
    return "border-transparent bg-destructive/10 text-destructive hover:bg-destructive/10 dark:bg-destructive/20 dark:hover:bg-destructive/20";
  }
  return "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary";
}
