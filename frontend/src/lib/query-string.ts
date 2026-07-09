// Construit une query string à partir de filtres/tris — toujours résolus
// côté backend, jamais un filtrage JS côté client (voir docs/modules/
// effectif-joueurs.md §Mesures). Reprise à l'identique dans 7+ fichiers
// avant cette factorisation. Une valeur tableau ajoute une entrée par
// élément (`?position=CB&position=RB`, voir FindPlayerTeamsQueryDto côté
// backend) ; `undefined`/chaîne vide ignorés.
export function toQueryString(
  params: Record<string, string | string[] | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) search.append(key, v);
    } else if (value) {
      search.set(key, value);
    }
  }
  return search.toString();
}
