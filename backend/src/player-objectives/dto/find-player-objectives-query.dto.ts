import { ObjectiveStatus, ObjectiveTheme } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsIn, IsInt, IsOptional } from 'class-validator';

// Filtres/tri toujours résolus côté backend (décision du 2026-07-06, voir
// docs/modules/effectif-joueurs.md §Mesures, réappliquée ici). dateFrom/
// dateTo bornent startDate (même champ que le tri, décision du 2026-07-06).
//
// `seasonId` (A12, docs/schema/joueurs.md §Filtrage des statistiques par
// période) : filtrage rétroactif par saison — mutuellement exclusif avec
// dateFrom/dateTo au niveau UI (sélecteur de mode côté frontend), le
// service applique celui qui est fourni, seasonId étant prioritaire s'il
// est présent (voir PlayerObjectivesService.findAllByPlayer).
export class FindPlayerObjectivesQueryDto {
  @IsOptional()
  @IsEnum(ObjectiveStatus)
  status?: ObjectiveStatus;

  @IsOptional()
  @IsEnum(ObjectiveTheme)
  theme?: ObjectiveTheme;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  seasonId?: number;

  // @Type(() => Date) convertit la chaîne ISO en Date avant validation :
  // Prisma (@db.Date) rejette une simple chaîne "AAAA-MM-JJ" en entrée client.
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
