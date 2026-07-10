import { Position } from '@prisma/client';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import { IsArray, IsEnum, IsIn, IsInt, IsOptional, Min } from 'class-validator';

// Même trois valeurs que la décision produit du module Effectif (voir
// docs/modules/effectif-joueurs.md) : Actif par défaut, Archivé, ou tout —
// pas un enum Prisma, ce statut n'est pas stocké tel quel (dérivé de
// leaveDate/endDate côté joueur/staff).
export type RosterStatus = 'ACTIVE' | 'ARCHIVED' | 'ALL';

export type RosterSortBy =
  'jerseyNumber' | 'lastName' | 'phone' | 'email' | 'birthDate' | 'role';

export class FindRosterQueryDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'ARCHIVED', 'ALL'])
  status?: RosterStatus;

  // Un filtre par poste n'a de sens que pour les joueurs (voir
  // RosterService) : appliqué, le staff est exclu du résultat plutôt que
  // renvoyé sans y correspondre.
  @IsOptional()
  @IsArray()
  @IsEnum(Position, { each: true })
  @Transform(({ value }: TransformFnParams): unknown[] =>
    Array.isArray(value) ? value : [value],
  )
  position?: Position[];

  @IsOptional()
  @IsIn(['jerseyNumber', 'lastName', 'phone', 'email', 'birthDate', 'role'])
  sortBy?: RosterSortBy;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([20, 50, 100])
  pageSize?: number;
}
