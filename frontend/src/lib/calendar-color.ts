import type { EventType } from "@/lib/event";

// Palette catégorielle validée (skill dataviz, references/palette.md) :
// ordre fixe, jamais recyclé. Classes Tailwind littérales (pas de nom
// construit dynamiquement type `bg-palette-${n}`) pour que le JIT les
// détecte à la compilation — voir globals.css pour les valeurs des
// variables --palette-1..8. Nommées "palette" et non "chart" : "chart-1..5"
// est un espace de noms spécial pour Tailwind/Lightning CSS (convention
// "Chart" de shadcn) qui générait un repli avec ses propres valeurs neutres
// par défaut, écrasant silencieusement nos vraies couleurs (bug trouvé en
// reproduisant en live — les événements Entraînement/Match/Autre
// s'affichaient tous en gris).
const CATEGORICAL_SLOTS = [
  "bg-palette-1",
  "bg-palette-2",
  "bg-palette-3",
  "bg-palette-4",
  "bg-palette-5",
  "bg-palette-6",
  "bg-palette-7",
  "bg-palette-8",
] as const;

// Au-delà de 8 équipes/catégories : repli sur une teinte neutre unique,
// jamais une 9e teinte générée (règle du skill dataviz).
const OTHER_SLOT = "bg-muted-foreground";

// Variante "checked" des mêmes slots, pour les cases à cocher de la barre de
// filtres (aide visuelle : la couleur de la case coche doit correspondre à
// la couleur des événements qu'elle filtre). Classes littérales pour rester
// détectables par le JIT Tailwind, mêmes jetons --palette-1..8 que ci-dessus.
const CATEGORICAL_CHECKBOX_SLOTS = [
  "data-[checked]:bg-palette-1 data-[checked]:border-palette-1",
  "data-[checked]:bg-palette-2 data-[checked]:border-palette-2",
  "data-[checked]:bg-palette-3 data-[checked]:border-palette-3",
  "data-[checked]:bg-palette-4 data-[checked]:border-palette-4",
  "data-[checked]:bg-palette-5 data-[checked]:border-palette-5",
  "data-[checked]:bg-palette-6 data-[checked]:border-palette-6",
  "data-[checked]:bg-palette-7 data-[checked]:border-palette-7",
  "data-[checked]:bg-palette-8 data-[checked]:border-palette-8",
] as const;
const OTHER_CHECKBOX_SLOT =
  "data-[checked]:bg-muted-foreground data-[checked]:border-muted-foreground";

// Vue Coach/Player : code couleur par type d'événement, toujours les 3
// premiers slots dans le même ordre (docs/modules/calendrier-evenements.md).
const TYPE_SLOT_INDEX: Record<EventType, number> = {
  TRAINING: 0,
  MATCH: 1,
  OTHER: 2,
};

export function eventTypeColorClass(type: EventType): string {
  return CATEGORICAL_SLOTS[TYPE_SLOT_INDEX[type]];
}

export function eventTypeCheckboxColorClass(type: EventType): string {
  return CATEGORICAL_CHECKBOX_SLOTS[TYPE_SLOT_INDEX[type]];
}

// Vue AdminClub : code couleur par équipe, slot assigné par position dans
// la liste des équipes accessibles (ordre stable de teams/mine), pas par id.
export function teamColorClass(teamIndex: number): string {
  return teamIndex >= 0 && teamIndex < CATEGORICAL_SLOTS.length
    ? CATEGORICAL_SLOTS[teamIndex]
    : OTHER_SLOT;
}

export function teamCheckboxColorClass(teamIndex: number): string {
  return teamIndex >= 0 && teamIndex < CATEGORICAL_CHECKBOX_SLOTS.length
    ? CATEGORICAL_CHECKBOX_SLOTS[teamIndex]
    : OTHER_CHECKBOX_SLOT;
}
