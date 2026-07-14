// Règles de départage disponibles (docs/schema/championnats.md §Championship)
// — un Json ordonné par l'utilisateur, pas un enum Postgres. Le frontend
// maintient sa propre copie (frontend/src/lib/tiebreaker-rules.ts, B6) pour
// les libellés i18n et les presets ; ce fichier est la seule source de
// vérité pour la validation `@IsIn` côté backend. FAIR_PLAY exclu du MVP
// (points de pénalité gérés par la fédération, non calculables
// automatiquement).
export const TIEBREAKER_RULES = [
  'GOAL_DIFFERENCE',
  'GOALS_SCORED',
  'GOALS_CONCEDED',
  'WINS',
  'HEAD_TO_HEAD_POINTS',
  'HEAD_TO_HEAD_GOAL_DIFF',
  'HEAD_TO_HEAD_GOALS_SCORED',
  'AWAY_GOALS',
  'RANDOM',
] as const;

export type TiebreakerRule = (typeof TIEBREAKER_RULES)[number];
