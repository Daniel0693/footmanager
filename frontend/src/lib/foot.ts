export const FEET = ["LEFT", "RIGHT", "BOTH"] as const;

export type Foot = (typeof FEET)[number];
