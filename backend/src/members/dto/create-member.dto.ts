import { Gender } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

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

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  // @Type(() => Date) convertit la chaîne ISO en Date avant validation :
  // Prisma (@db.Date) rejette une simple chaîne "AAAA-MM-JJ" en entrée client.
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  birthDate?: Date;
}
