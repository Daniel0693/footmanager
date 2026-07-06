export const NOTE_VISIBILITIES = ["PRIVE", "SEMI_PRIVE", "PUBLIC"] as const;

export type NoteVisibility = (typeof NOTE_VISIBILITIES)[number];
