"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { apiFetch } from "../api";

export interface PublicUser {
  id: number;
  email: string;
  locale: string;
  emailVerified: boolean;
  createdAt: string;
}

interface Session {
  accessToken: string;
  user: PublicUser;
}

interface AuthContextValue {
  user: PublicUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, locale?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Alignés sur JWT_ACCESS_EXPIRES_IN côté backend (15m par défaut) : on
// redemande un access token un peu avant son expiration pour ne jamais
// laisser l'utilisateur avec un token expiré (silent refresh).
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_MARGIN_MS = 60 * 1000;

async function parseErrorCode(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.code ?? "AUTH.UNKNOWN";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSession = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    setAccessToken(null);
    setUser(null);
  }, []);

  const silentRefresh = useCallback(async (): Promise<Session | null> => {
    const response = await apiFetch("/auth/refresh", { method: "POST" });
    if (!response.ok) {
      clearSession();
      return null;
    }
    return response.json();
  }, [clearSession]);

  const applySession = useCallback(
    (session: Session) => {
      setAccessToken(session.accessToken);
      setUser(session.user);

      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        void silentRefresh().then((next) => {
          if (next) applySession(next);
        });
      }, ACCESS_TOKEN_TTL_MS - REFRESH_MARGIN_MS);
    },
    [silentRefresh],
  );

  useEffect(() => {
    silentRefresh()
      .then((session) => {
        if (session) applySession(session);
      })
      .finally(() => setIsLoading(false));

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        throw new Error(await parseErrorCode(response));
      }
      applySession(await response.json());
    },
    [applySession],
  );

  const register = useCallback(
    async (email: string, password: string, locale?: string) => {
      const response = await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, locale }),
      });
      if (!response.ok) {
        throw new Error(await parseErrorCode(response));
      }
      applySession(await response.json());
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    await apiFetch("/auth/logout", { method: "POST" });
    clearSession();
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{ user, accessToken, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
