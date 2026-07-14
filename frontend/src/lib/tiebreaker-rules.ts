// Règles de départage disponibles (docs/modules/saisons-championnats.md
// §Règles de départage disponibles) — Json ordonné par l'utilisateur, pas un
// enum. Miroir de backend/src/championships/tiebreaker-rule.ts ; jamais de
// libellé en dur, toujours via useTranslations("tiebreakerRules").
export const TIEBREAKER_RULES = [
  "GOAL_DIFFERENCE",
  "GOALS_SCORED",
  "GOALS_CONCEDED",
  "WINS",
  "HEAD_TO_HEAD_POINTS",
  "HEAD_TO_HEAD_GOAL_DIFF",
  "HEAD_TO_HEAD_GOALS_SCORED",
  "AWAY_GOALS",
  "RANDOM",
] as const;

export type TiebreakerRule = (typeof TIEBREAKER_RULES)[number];
