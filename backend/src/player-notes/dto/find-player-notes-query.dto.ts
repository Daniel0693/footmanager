import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional } from 'class-validator';

// Filtre/tri toujours résolus côté backend (décision du 2026-07-06, voir
// docs/modules/effectif-joueurs.md §Mesures, réappliquée ici). dateFrom/
// dateTo bornent createdAt : PlayerNote n'a pas d'autre champ date métier.
//
// `seasonId` (A12, docs/schema/joueurs.md §Filtrage des statistiques par
// période) : filtrage rétroactif par saison — mutuellement exclusif avec
// dateFrom/dateTo au niveau UI (sélecteur de mode côté frontend), le
// service applique celui qui est fourni, seasonId étant prioritaire s'il
// est présent (voir PlayerNotesService.findAllByPlayer).
export class FindPlayerNotesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  seasonId?: number;

  // @Type(() => Date) convertit la chaîne ISO reçue en query en objet Date
  // avant validation : Prisma attend un Date, jamais une simple chaîne.
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
