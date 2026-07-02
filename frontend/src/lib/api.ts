const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function apiFetch(path: string, options: RequestInit = {}) {
  return fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
}
