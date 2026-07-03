export const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;

export type Gender = (typeof GENDERS)[number];
