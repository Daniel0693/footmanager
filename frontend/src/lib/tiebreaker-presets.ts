import type { TiebreakerRule } from "@/lib/tiebreaker-rules";

// Presets de règles de départage (docs/modules/saisons-championnats.md
// §Presets de règles de départage) — préremplissent tiebreakerRules dans
// ChampionshipFormDialog ; l'utilisateur reste libre de réordonner/modifier
// ensuite (bouton Monter/Descendre, pas de lib drag & drop). `key` est
// stocké tel quel dans `Championship.tiebreakerPreset` (jamais un libellé
// traduit — cohérent avec la règle i18n du projet).
export interface TiebreakerPreset {
  key: string;
  rules: TiebreakerRule[];
}

export const TIEBREAKER_PRESETS: TiebreakerPreset[] = [
  {
    key: "STANDARD_UEFA",
    rules: [
      "GOAL_DIFFERENCE",
      "GOALS_SCORED",
      "HEAD_TO_HEAD_POINTS",
      "HEAD_TO_HEAD_GOAL_DIFF",
    ],
  },
  {
    key: "SWISS_JUNIOR",
    rules: ["GOAL_DIFFERENCE", "GOALS_SCORED", "WINS"],
  },
  {
    key: "SIMPLE",
    rules: ["GOAL_DIFFERENCE", "GOALS_SCORED"],
  },
];

// Sélectionné quand la liste ne correspond à aucun preset connu (créée par
// réordonnancement/ajout/retrait manuel) — pas une entrée de
// TIEBREAKER_PRESETS, seulement une valeur de repli pour le sélecteur.
export const CUSTOM_PRESET_KEY = "CUSTOM";
