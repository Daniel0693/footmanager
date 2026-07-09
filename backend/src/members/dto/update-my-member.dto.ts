import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

// "Mon profil" (docs/roadmap.md) : édition volontairement minimale, un seul
// champ pour l'instant — birthDate n'a aujourd'hui aucune interface pour les
// rôles non-Player (Coach/Parent/AdminClub), voir MembersController.updateMe.
export class UpdateMyMemberDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  birthDate?: Date;
}
