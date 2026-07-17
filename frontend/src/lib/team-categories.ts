export const TEAM_CATEGORIES = [
  "U9",
  "U11",
  "U13",
  "U15",
  "U17",
  "U19",
  "SENIORS",
] as const;

export type TeamCategory = (typeof TEAM_CATEGORIES)[number];
