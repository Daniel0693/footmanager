import { apiFetch, authHeaders } from "@/lib/api";
import { getLastTeam } from "@/lib/last-team";

// Résout un teamId quelconque du club pour un appelant, utilisé uniquement
// pour transmettre `?teamId=` sur une route club-wide sans `:teamId` dans son
// URL (ex. `clubs/:clubId/seasons`) — un Coach/Player en scope TEAM sur
// `season` n'est autorisé par PermissionsGuard que s'il transmet une équipe
// où il tient effectivement un rôle (voir docs/modules/auth-roles.md
// §"Patterns découverts"). Peu importe LAQUELLE de ses équipes est transmise :
// seule sa présence compte pour la vérification de scope, jamais utilisée
// pour filtrer les données renvoyées (Season est club-wide, pas équipe).
//
// AdminClub/SuperAdmin/Proprietaire (scope CLUB/ALL) n'en ont pas besoin,
// mais l'envoyer ne leur nuit pas (le guard matche déjà sans condition sur
// teamId pour un scope club-wide) — pas besoin de distinguer les deux cas ici.
export async function resolveAnyTeamId(
  clubId: string,
  userId: number,
  accessToken: string | null | undefined,
): Promise<string | null> {
  const lastTeam = getLastTeam(userId);
  if (lastTeam?.clubId === clubId) return lastTeam.teamId;

  try {
    const response = await apiFetch(`/clubs/${clubId}/teams/mine`, {
      headers: authHeaders(accessToken),
    });
    if (!response.ok) return null;
    const teams = (await response.json()) as Array<{ id: number }>;
    return teams[0] ? String(teams[0].id) : null;
  } catch {
    return null;
  }
}
