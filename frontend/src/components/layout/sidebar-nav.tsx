"use client";

import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { apiFetch, authHeaders } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { getLastTeam, setLastTeam } from "@/lib/last-team";
import { resolveAnyTeamId } from "@/lib/resolve-any-team";
import { cn } from "@/lib/utils";
import { navModules } from "./nav-modules";

interface SidebarNavProps {
  open: boolean;
  onNavigate: () => void;
}

function paramString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function SidebarNav({ open, onNavigate }: SidebarNavProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const params = useParams();
  const { user, accessToken } = useAuth();
  const clubId = paramString(params.clubId as string | string[] | undefined);
  const teamId = paramString(params.teamId as string | string[] | undefined);

  // Cache le lien "Saisons" pour un membre sans AUCUN droit de lecture sur
  // `season` dans ce club (ex. Parent, non câblé sur cette ressource — voir
  // backend/prisma/seed.ts) : évite d'exposer un lien vers une page qui
  // renverrait systématiquement 403. `false` par défaut (affiché tant que
  // l'appel n'a pas répondu, ou pour tout autre rôle) — seul un 403 explicite
  // masque l'entrée, jamais déduit d'un rôle côté client (Règle d'or,
  // CLAUDE.md). Portée volontairement limitée à Saisons : Effectif/Calendrier
  // ne présentent pas ce symptôme (tout rôle qui y accède a au moins un droit
  // de lecture sur sa propre équipe).
  const [seasonsAccessDenied, setSeasonsAccessDenied] = useState(false);
  useEffect(() => {
    if (!clubId || !user) return;
    let cancelled = false;
    (async () => {
      const anyTeamId = await resolveAnyTeamId(clubId, user.id, accessToken);
      const query = anyTeamId ? `?teamId=${anyTeamId}` : "";
      try {
        const response = await apiFetch(`/clubs/${clubId}/seasons${query}`, {
          headers: authHeaders(accessToken),
        });
        if (!cancelled) setSeasonsAccessDenied(response.status === 403);
      } catch {
        // Silencieux : en cas d'échec réseau, le lien reste affiché (défaut
        // permissif), la page elle-même gère son propre état d'erreur.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clubId, user, accessToken]);

  // Persiste l'équipe visitée pour ce club — écrit vers un système externe
  // (localStorage), cas d'usage légitime d'un effect.
  useEffect(() => {
    if (user && clubId && teamId) {
      setLastTeam(user.id, clubId, teamId);
    }
  }, [user, clubId, teamId]);

  // Lecture pure (pas d'effect/state nécessaire) : SidebarNav ne monte
  // jamais pendant le rendu serveur — AppShell retourne null tant que
  // `user` n'est pas résolu (voir app-shell.tsx) — donc pas de risque de
  // désynchronisation SSR/client à lire localStorage directement ici.
  // Complète teamId manquant avec la dernière équipe visitée dans CE club
  // (jamais celle d'un autre club, jamais celle d'un autre utilisateur) :
  // permet à "Effectif"/"Saisons" de rester sur l'équipe déjà choisie même
  // depuis une page scopée club (Calendrier, liste des équipes).
  const effectiveParams = useMemo(() => {
    if (teamId || !clubId || !user) return params;
    const lastTeam = getLastTeam(user.id);
    return lastTeam?.clubId === clubId ? { ...params, teamId: lastTeam.teamId } : params;
  }, [params, clubId, teamId, user]);

  const visibleModules = useMemo(
    () => navModules.filter((module) => module.key !== "seasons" || !seasonsAccessDenied),
    [seasonsAccessDenied],
  );

  return (
    <>
      <div
        role="presentation"
        onClick={onNavigate}
        className={cn(
          "fixed inset-0 z-40 bg-black/30 md:hidden",
          open ? "block" : "hidden",
        )}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform md:static md:z-auto md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {visibleModules.map((module) => {
            const Icon = module.icon;
            const active = module.isActive(pathname);
            return (
              <Link
                key={module.key}
                href={module.href(effectiveParams)}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {t(module.labelKey)}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
