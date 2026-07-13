"use client";

import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { getLastTeam, setLastTeam } from "@/lib/last-team";
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
  const { user } = useAuth();
  const clubId = paramString(params.clubId as string | string[] | undefined);
  const teamId = paramString(params.teamId as string | string[] | undefined);

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
          {navModules.map((module) => {
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
