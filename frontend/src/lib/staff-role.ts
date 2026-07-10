// Miroir de l'enum Prisma TeamStaffRole (docs/schema/joueurs.md) — première
// apparition du staff côté frontend (module Effectif, tableau unifié B5).
export const STAFF_ROLES = ["PRINCIPAL", "CO_ENTRAINEUR", "ADJOINT"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
