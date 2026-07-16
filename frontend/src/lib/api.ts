const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// Construction du header d'authentification, mutualisée : reprise à
// l'identique dans une vingtaine de fichiers avant cette factorisation —
// un seul endroit à corriger si le schéma d'auth évolue (ex. renouvellement
// silencieux du token).
export function authHeaders(accessToken: string | null | undefined): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

// FormData (upload fichier, import D2) : ne jamais forcer Content-Type,
// le navigateur doit fixer lui-même le boundary multipart.
export function apiFetch(path: string, options: RequestInit = {}) {
  const isFormData = options.body instanceof FormData;
  return fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: isFormData
      ? { ...options.headers }
      : { "Content-Type": "application/json", ...options.headers },
  });
}

// Le back ne renvoie jamais de texte traduit, uniquement un code (voir
// docs/schema/index.md §i18n) — à passer tel quel à useTranslations("errors").
export async function parseErrorCode(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.code ?? "AUTH.UNKNOWN";
}
