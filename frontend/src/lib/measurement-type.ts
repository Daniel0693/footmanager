export const MEASUREMENT_TYPES = ["HEIGHT", "WEIGHT"] as const;

export type MeasurementType = (typeof MEASUREMENT_TYPES)[number];
