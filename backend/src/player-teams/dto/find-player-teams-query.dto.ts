import { Position } from '@prisma/client';
import { Transform, type TransformFnParams } from 'class-transformer';
import { IsArray, IsEnum, IsOptional } from 'class-validator';

// Filtres toujours résolus côté backend (décision du 2026-07-06, voir
// docs/modules/effectif-joueurs.md §Mesures, réappliquée ici) — la page
// effectif ne doit plus charger tout le roster puis filtrer en JS. Le
// regroupement par "ligne" (gardien/défense/milieu/attaque) reste résolu
// côté frontend (lib/positions.ts, seule source de vérité — la ligne n'est
// volontairement pas stockée en base, voir docs/schema/index.md) : le
// frontend traduit une ligne sélectionnée en la liste des `Position` qui la
// composent avant de l'envoyer ici.
export class FindPlayerTeamsQueryDto {
  // Express parse un seul `?position=CB` en chaîne, plusieurs occurrences en
  // tableau — on normalise toujours en tableau avant validation.
  @IsOptional()
  @IsArray()
  @IsEnum(Position, { each: true })
  @Transform(({ value }: TransformFnParams): unknown[] =>
    Array.isArray(value) ? value : [value],
  )
  position?: Position[];
}
