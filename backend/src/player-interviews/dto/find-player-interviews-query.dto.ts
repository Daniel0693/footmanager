import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional } from 'class-validator';

// Filtrage/tri toujours côté backend (décision du 2026-07-06, voir
// docs/modules/effectif-joueurs.md §Mesures, réappliquée ici).
//
// `seasonId` (A12, docs/schema/joueurs.md §Filtrage des statistiques par
// période) : filtrage rétroactif par saison — mutuellement exclusif avec
// dateFrom/dateTo au niveau UI (sélecteur de mode côté frontend), le
// service applique celui qui est fourni, seasonId étant prioritaire s'il
// est présent (voir PlayerInterviewsService.findAllByPlayer).
export class FindPlayerInterviewsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  seasonId?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateTo?: Date;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
