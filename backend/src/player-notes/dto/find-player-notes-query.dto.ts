import { IsIn, IsOptional } from 'class-validator';

// Tri toujours résolu côté backend (décision du 2026-07-06, voir
// docs/modules/effectif-joueurs.md §Mesures, réappliquée ici).
export class FindPlayerNotesQueryDto {
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
