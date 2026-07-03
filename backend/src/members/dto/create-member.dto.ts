import { IsOptional, IsString, MinLength } from 'class-validator';

// Pas de champ userId : cet endpoint crée un membre sans compte de connexion
// (docs/schema/fondations.md — "Membres sans compte"). Rattacher un User
// existant est un mécanisme d'invitation non implémenté au MVP.
export class CreateMemberDto {
  @IsString()
  @MinLength(1)
  firstName: string;

  @IsString()
  @MinLength(1)
  lastName: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
