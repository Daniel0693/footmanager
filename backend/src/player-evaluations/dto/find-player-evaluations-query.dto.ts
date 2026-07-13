import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional } from 'class-validator';

// Filtres/tri toujours résolus côté backend (décision du 2026-07-06, voir
// docs/modules/effectif-joueurs.md §Mesures, réappliquée ici). dateFrom/
// dateTo bornent `date` (@db.Date, pas d'horodatage — pas de traitement de
// fin de journée nécessaire, contrairement à PlayerNote.createdAt). Pas de
// filtre par critère : une évaluation est une session multi-critères, ce
// filtre n'a plus de sens à cette granularité (décision du 2026-07-06).
//
// `seasonId` (A12, docs/schema/joueurs.md §Filtrage des statistiques par
// période) : filtrage rétroactif par saison — mutuellement exclusif avec
// dateFrom/dateTo au niveau UI (sélecteur de mode côté frontend), le
// service applique celui qui est fourni, seasonId étant prioritaire s'il
// est présent (voir PlayerEvaluationsService.findAllByPlayer).
export class FindPlayerEvaluationsQueryDto {
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
