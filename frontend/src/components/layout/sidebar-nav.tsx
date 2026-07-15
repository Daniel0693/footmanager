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

  // Cache le lien "Saisons" pour tout rôle qui n'a pas la capacité de GÉRER
  // les saisons (`canManage`, calculé par le backend — SeasonsService,
  // renvoyé par `GET /clubs/:clubId/seasons`) : retour utilisateur (B18,
  // docs/roadmap.md) — la fiche de saison ne contient que 2 dates et un
  // statut pour un Coach/Player en lecture seule, pas assez d'information
  // pour justifier une entrée de nav dédiée. Coach/Player gardent malgré
  // tout `season READ TEAM` côté backend (inchangé) : ils continueront de
  // voir les saisons dans les futurs filtres des autres pages (même
  // principe que `SeasonFilterSelect`, A12), simplement pas via ce lien de
  // nav. `false` par défaut (affiché tant que l'appel n'a pas répondu) —
  // jamais déduit d'un rôle côté client (Règle d'or, CLAUDE.md), toujours
  // du `canManage` réel renvoyé par le backend. Un 403 (Parent, aucune
  // permission `season`) masque aussi le lien, `canManage` n'étant alors
  // même pas présent dans la réponse. Portée volontairement limitée à
  // Saisons : Effectif/Calendrier/Championnats restent utiles en lecture
  // seule pour Coach/Player.
  const [seasonsNavHidden, setSeasonsNavHidden] = useState(false);
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
        if (cancelled) return;
        if (response.status === 403) {
          setSeasonsNavHidden(true);
          return;
        }
        if (!response.ok) return;
        const body = (await response.json()) as { canManage?: boolean };
        setSeasonsNavHidden(!body.canManage);
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

  // Variante du bouton "Effectif" selon le rôle réel (B21, retour
  // utilisateur) — jamais déduite d'un rôle côté client, toujours du
  // `readScope` renvoyé par `GET /clubs/:clubId/teams/mine`
  // (`TeamsService.findMineInClub`) : `ALL` (SuperAdmin/Proprietaire) →
  // bouton "Club" vers la liste des clubs (`/home`, qui liste déjà "mes
  // clubs") ; `CLUB` (AdminClub) → bouton "Équipes" vers le tableau des
  // équipes du club ; `null` (Coach/Player, un scope TEAM ne matche
  // structurellement jamais ce `can()` sans teamId dans le contexte — voir
  // le commentaire du service) → bouton "Effectif" directement vers sa
  // propre équipe (`data[0]`), sans étape intermédiaire — il n'a pas besoin
  // de voir les autres effectifs. `clubId` résolu depuis l'URL, sinon depuis
  // la dernière équipe visitée (`last-team.ts`) pour que ce calcul reste
  // possible même depuis une page sans clubId dans l'URL (ex. `/home`).
  const effectiveClubId = clubId ?? (user ? getLastTeam(user.id)?.clubId : undefined);
  const [rosterNav, setRosterNav] = useState<{ labelKey: string; href: string } | null>(null);
  useEffect(() => {
    if (!effectiveClubId || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await apiFetch(`/clubs/${effectiveClubId}/teams/mine`, {
          headers: authHeaders(accessToken),
        });
        if (cancelled || !response.ok) return;
        const body = (await response.json()) as {
          data: { id: number }[];
          readScope: string | null;
        };
        if (cancelled) return;
        if (body.readScope === "ALL") {
          setRosterNav({ labelKey: "club", href: "/home" });
        } else if (body.readScope === "CLUB") {
          setRosterNav({ labelKey: "teams", href: `/clubs/${effectiveClubId}/teams` });
        } else {
          const firstTeamId = body.data[0] ? String(body.data[0].id) : undefined;
          setRosterNav({
            labelKey: "roster",
            href: firstTeamId
              ? `/clubs/${effectiveClubId}/teams/${firstTeamId}/players`
              : `/clubs/${effectiveClubId}/teams`,
          });
        }
      } catch {
        // Silencieux : en cas d'échec réseau, le lien garde son comportement
        // par défaut (nav-modules.ts), la page elle-même gère son erreur.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveClubId, user, accessToken]);

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
    () => navModules.filter((module) => module.key !== "seasons" || !seasonsNavHidden),
    [seasonsNavHidden],
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
            const isRoster = module.key === "roster";
            const href =
              isRoster && rosterNav ? rosterNav.href : module.href(effectiveParams);
            const labelKey = isRoster && rosterNav ? rosterNav.labelKey : module.labelKey;
            return (
              <Link
                key={module.key}
                href={href}
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
                {t(labelKey)}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
