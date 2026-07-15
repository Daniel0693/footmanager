import { IsInt } from 'class-validator';

// Le joueur ciblé vient de l'URL (:playerId) — seul le Member Parent à lier
// est transmis dans le corps. Jamais l'inverse (pas de endpoint où le Parent
// se lie lui-même) : voir ParentChildService.create.
export class CreateParentChildDto {
  @IsInt()
  parentMemberId: number;
}
