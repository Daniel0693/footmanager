export const OBJECTIVE_THEMES = ["TECHNIQUE", "PHYSIQUE", "MENTAL", "TACTIQUE"] as const;
export type ObjectiveTheme = (typeof OBJECTIVE_THEMES)[number];

export const OBJECTIVE_HORIZONS = ["SHORT_TERM", "MID_TERM", "LONG_TERM"] as const;
export type ObjectiveHorizon = (typeof OBJECTIVE_HORIZONS)[number];

export const OBJECTIVE_STATUSES = ["PLANNED", "IN_PROGRESS", "ACHIEVED", "FAILED"] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];
