import type { EventType } from "@/lib/event";

// Palette catégorielle validée (skill dataviz, references/palette.md) :
// ordre fixe, jamais recyclé. Classes Tailwind littérales (pas de nom
// construit dynamiquement type `bg-chart-${n}`) pour que le JIT les
// détecte à la compilation — voir globals.css pour les valeurs des
// variables --chart-1..8.
const CATEGORICAL_SLOTS = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
  "bg-chart-6",
  "bg-chart-7",
  "bg-chart-8",
] as const;

// Au-delà de 8 équipes/catégories : repli sur une teinte neutre unique,
// jamais une 9e teinte générée (règle du skill dataviz).
const OTHER_SLOT = "bg-muted-foreground";

// Vue Coach/Player : code couleur par type d'événement, toujours les 3
// premiers slots dans le même ordre (docs/modules/calendrier-evenements.md).
const TYPE_SLOT: Record<EventType, string> = {
  TRAINING: CATEGORICAL_SLOTS[0],
  MATCH: CATEGORICAL_SLOTS[1],
  OTHER: CATEGORICAL_SLOTS[2],
};

export function eventTypeColorClass(type: EventType): string {
  return TYPE_SLOT[type];
}

// Vue AdminClub : code couleur par équipe, slot assigné par position dans
// la liste des équipes accessibles (ordre stable de teams/mine), pas par id.
export function teamColorClass(teamIndex: number): string {
  return teamIndex >= 0 && teamIndex < CATEGORICAL_SLOTS.length
    ? CATEGORICAL_SLOTS[teamIndex]
    : OTHER_SLOT;
}
