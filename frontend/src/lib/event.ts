export const EVENT_TYPES = ["TRAINING", "MATCH", "OTHER"] as const;

export type EventType = (typeof EVENT_TYPES)[number];
