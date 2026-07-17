import type { GameFormat } from "@/lib/formations";
import type { TeamCategory } from "@/lib/team-categories";

// Format de jeu suggéré par défaut selon la catégorie d'âge de l'équipe
// (docs/modules/matchs.md §Format de jeu, B10, 2026-07-17) — simple valeur
// de préremplissage à la création d'un match/championnat, TOUJOURS
// modifiable (aucune contrainte imposée entre catégorie et format, cas
// prévu explicitement : un club peut faire jouer ses U13 en 11 contre 11
// pour préparer la saison suivante). Convention FFF courante, adaptée aux 7
// catégories du MVP (pas de granularité U6/U7/U8/U10/U12 séparée).
export const CATEGORY_DEFAULT_GAME_FORMAT: Record<TeamCategory, GameFormat> = {
  U9: "SIX",
  U11: "EIGHT",
  U13: "NINE",
  U15: "ELEVEN",
  U17: "ELEVEN",
  U19: "ELEVEN",
  SENIORS: "ELEVEN",
};
