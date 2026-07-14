import { Calendar, Goal, Home, Trophy, Users, type LucideIcon } from "lucide-react";

type RouteParams = Record<string, string | string[] | undefined>;

export interface NavModule {
  key: string;
  icon: LucideIcon;
  labelKey: string;
  href(params: RouteParams): string;
  isActive(pathname: string): boolean;
}

function paramString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Modules Effectif, Calendrier, Saisons et Championnats existent pour l'instant (voir
// docs/roadmap.md, Phases 2 et 3). Ajouter un futur module (Matchs, Entraînement...) = une
// entrée de plus ici.
export const navModules: NavModule[] = [
  {
    key: "home",
    icon: Home,
    labelKey: "home",
    href: () => "/home",
    isActive: (pathname) => pathname === "/home",
  },
  {
    key: "roster",
    icon: Users,
    labelKey: "roster",
    href: (params) => {
      const clubId = paramString(params.clubId);
      const teamId = paramString(params.teamId);
      if (!clubId) return "/home";
      return teamId ? `/clubs/${clubId}/teams/${teamId}/players` : `/clubs/${clubId}/teams`;
    },
    isActive: (pathname) =>
      pathname.startsWith("/clubs") &&
      !pathname.includes("/calendar") &&
      !pathname.includes("/seasons") &&
      !pathname.includes("/championships"),
  },
  {
    key: "calendar",
    icon: Calendar,
    labelKey: "calendar",
    href: (params) => {
      const clubId = paramString(params.clubId);
      if (!clubId) return "/home";
      return `/clubs/${clubId}/calendar`;
    },
    isActive: (pathname) => pathname.includes("/calendar"),
  },
  {
    key: "seasons",
    icon: Trophy,
    labelKey: "seasons",
    // Club-wide depuis la révision A14 (docs/roadmap.md) : plus besoin du
    // repli "dernière équipe visitée" (last-team.ts), qui reste utile
    // uniquement pour Effectif (roster.href ci-dessus).
    href: (params) => {
      const clubId = paramString(params.clubId);
      if (!clubId) return "/home";
      return `/clubs/${clubId}/seasons`;
    },
    isActive: (pathname) => pathname.includes("/seasons"),
  },
  {
    key: "championships",
    icon: Goal,
    labelKey: "championships",
    // Scopé équipe (Partie B, docs/roadmap.md) : chaque équipe gère son
    // propre championnat — même repli "dernière équipe visitée" que
    // Effectif (roster.href ci-dessus), contrairement à Saisons (club-wide).
    href: (params) => {
      const clubId = paramString(params.clubId);
      const teamId = paramString(params.teamId);
      if (!clubId) return "/home";
      return teamId
        ? `/clubs/${clubId}/teams/${teamId}/championships`
        : `/clubs/${clubId}/teams`;
    },
    isActive: (pathname) => pathname.includes("/championships"),
  },
];
