// Format d'affichage unique pour tout le projet : JJ/MM/AAAA — décision
// explicite (pas dérivé de la locale, contrairement aux horaires d'événement
// du calendrier qui restent locale-sensibles via toLocaleString).
// Getters UTC (pas locaux) : une date pure (@db.Date, ex. birthDate/joinDate)
// arrive du backend sérialisée à minuit UTC — lire en heure locale décalerait
// d'un jour pour tout fuseau derrière UTC (même piège que documenté dans
// lib/calendar-grid.ts pour les événements du calendrier).
export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}
