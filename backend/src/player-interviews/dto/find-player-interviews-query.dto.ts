import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional } from 'class-validator';

// Filtrage/tri toujours côté backend (décision du 2026-07-06, voir
// docs/modules/effectif-joueurs.md §Mesures, réappliquée ici).
export class FindPlayerInterviewsQueryDto {
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
