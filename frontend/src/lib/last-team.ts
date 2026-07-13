// Mémorise la dernière équipe visitée par l'utilisateur connecté, pour que
// les modules scopés équipe (Effectif, Saisons) restent sur cette équipe
// même depuis une page scopée club sans teamId dans l'URL (Calendrier,
// liste des équipes) — voir SidebarNav.
//
// Clé de stockage scopée par userId : évite de reproduire le bug déjà
// documenté et corrigé pour la sélection de club (voir
// docs/decisions-ouvertes-et-rgpd.md — "Mes clubs" a remplacé un suivi
// localStorage non fiable, un identifiant persistant qui fuitait d'un
// compte à l'autre sur le même navigateur). Un changement de compte lit une
// clé différente : jamais l'équipe d'un autre utilisateur.
const STORAGE_KEY_PREFIX = "footmanager:lastTeam:";

interface LastTeam {
  clubId: string;
  teamId: string;
}

function storageKey(userId: number): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

export function getLastTeam(userId: number): LastTeam | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastTeam>;
    if (typeof parsed.clubId !== "string" || typeof parsed.teamId !== "string") {
      return null;
    }
    return { clubId: parsed.clubId, teamId: parsed.teamId };
  } catch {
    return null;
  }
}

export function setLastTeam(userId: number, clubId: string, teamId: string): void {
  if (typeof window === "undefined") return;
  const value: LastTeam = { clubId, teamId };
  window.localStorage.setItem(storageKey(userId), JSON.stringify(value));
}
