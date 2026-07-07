import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional } from 'class-validator';

// Filtres/tri toujours résolus côté backend (décision du 2026-07-06, voir
// docs/modules/effectif-joueurs.md §Mesures, réappliquée ici). dateFrom/
// dateTo bornent `date` (@db.Date, pas d'horodatage — pas de traitement de
// fin de journée nécessaire, contrairement à PlayerNote.createdAt). Pas de
// filtre par critère : une évaluation est une session multi-critères, ce
// filtre n'a plus de sens à cette granularité (décision du 2026-07-06).
export class FindPlayerEvaluationsQueryDto {
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
