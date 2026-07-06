// Postes réels du football (docs/schema/index.md — enum Position). La ligne
// (gardien/défense/milieu/attaque) n'est pas stockée en base : elle est
// dérivée ici, en code, pour construire les filtres groupés par ligne sans
// donnée dénormalisée à synchroniser (voir décision du 2026-07-03, étape A1).

export const POSITIONS = [
  'GK',
  'CB',
  'RB',
  'LB',
  'RWB',
  'LWB',
  'CDM',
  'CM',
  'RM',
  'LM',
  'CAM',
  'RW',
  'LW',
  'CF',
  'ST',
] as const;

export type Position = (typeof POSITIONS)[number];

export const POSITION_LINES = ['GK', 'DEF', 'MID', 'ATT'] as const;

export type PositionLine = (typeof POSITION_LINES)[number];

export const LINE_POSITIONS: Record<PositionLine, Position[]> = {
  GK: ['GK'],
  DEF: ['CB', 'RB', 'LB', 'RWB', 'LWB'],
  MID: ['CDM', 'CM', 'RM', 'LM', 'CAM'],
  ATT: ['RW', 'LW', 'CF', 'ST'],
};

const POSITION_TO_LINE: Record<Position, PositionLine> = Object.fromEntries(
  POSITION_LINES.flatMap((line) =>
    LINE_POSITIONS[line].map((position) => [position, line]),
  ),
) as Record<Position, PositionLine>;

export function lineForPosition(position: Position): PositionLine {
  return POSITION_TO_LINE[position];
}

export interface PositionPitchSpot {
  id: string;
  position: Position;
  // Pourcentages sur un viewBox 0-100 / 0-100 : x = touche gauche (0) à
  // droite (100), y = but adverse / attaque (0) à but du gardien (100).
  x: number;
  y: number;
}

/**
 * Emplacements des 15 postes sur une représentation stylisée du terrain
 * (sélecteur de poste façon Football Manager, fiche joueur — décision du
 * 2026-07-06). CB/CM/CF apparaissent deux fois (gauche/droite) pour un rendu
 * de ligne réaliste ; les deux points partagent le même code de poste et se
 * sélectionnent/désélectionnent ensemble.
 */
export const POSITION_PITCH_SPOTS: PositionPitchSpot[] = [
  { id: 'st', position: 'ST', x: 50, y: 8 },
  { id: 'cf-left', position: 'CF', x: 35, y: 18 },
  { id: 'cf-right', position: 'CF', x: 65, y: 18 },
  { id: 'lw', position: 'LW', x: 12, y: 26 },
  { id: 'rw', position: 'RW', x: 88, y: 26 },
  { id: 'cam', position: 'CAM', x: 50, y: 34 },
  { id: 'lm', position: 'LM', x: 14, y: 44 },
  { id: 'cm-left', position: 'CM', x: 38, y: 46 },
  { id: 'cm-right', position: 'CM', x: 62, y: 46 },
  { id: 'rm', position: 'RM', x: 86, y: 44 },
  { id: 'cdm', position: 'CDM', x: 50, y: 56 },
  { id: 'lwb', position: 'LWB', x: 10, y: 62 },
  { id: 'rwb', position: 'RWB', x: 90, y: 62 },
  { id: 'lb', position: 'LB', x: 15, y: 74 },
  { id: 'cb-left', position: 'CB', x: 38, y: 78 },
  { id: 'cb-right', position: 'CB', x: 62, y: 78 },
  { id: 'rb', position: 'RB', x: 85, y: 74 },
  { id: 'gk', position: 'GK', x: 50, y: 92 },
];
