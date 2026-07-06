import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional } from 'class-validator';

// Filtre/tri toujours résolus côté backend (décision du 2026-07-06, voir
// docs/modules/effectif-joueurs.md §Mesures, réappliquée ici). dateFrom/
// dateTo bornent createdAt : PlayerNote n'a pas d'autre champ date métier.
export class FindPlayerNotesQueryDto {
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
