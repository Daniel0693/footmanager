import { Home, Users, type LucideIcon } from "lucide-react";

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

// Un seul module Effectif existe pour l'instant (voir docs/roadmap.md, Phase 2).
// Ajouter un futur module (Calendrier, Matchs...) = une entrée de plus ici.
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
    isActive: (pathname) => pathname.startsWith("/clubs"),
  },
];
