const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function apiFetch(path: string, options: RequestInit = {}) {
  return fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
}

// Le back ne renvoie jamais de texte traduit, uniquement un code (voir
// docs/schema/index.md §i18n) — à passer tel quel à useTranslations("errors").
export async function parseErrorCode(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.code ?? "AUTH.UNKNOWN";
}
