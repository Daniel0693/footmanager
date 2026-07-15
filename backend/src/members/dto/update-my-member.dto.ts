import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, MinLength } from 'class-validator';

// "Mon profil" (docs/roadmap.md) : un membre auto-provisionné
// (MembersService.resolveOrProvisionMember) reçoit un nom placeholder dérivé
// de son email — firstName/lastName/phone lui permettent de le remplacer par
// ses vraies informations (mêmes contraintes que UpdateMemberDto, édition
// staff). birthDate reste le seul champ historique de cette route (voir
// MembersController.updateMe). Utile notamment pour le rôle Parent
// (docs/modules/auth-roles.md §Rôle Parent) : c'est la seule donnée fiable
// détenue par le système pour joindre un parent tant qu'il n'a rien complété.
export class UpdateMyMemberDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  birthDate?: Date;
}
