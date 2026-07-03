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
