import { Gender, Position } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

// Une ligne de création en masse (B4) : crée le Member sous-jacent (pas
// encore de compte de connexion, voir CreateMemberDto) puis le PlayerProfile
// et le PlayerTeam en une fois — contrairement à l'API existante
// (POST /members puis POST /players puis POST /teams/:teamId/players en
// trois appels), le bulk n'a qu'un seul appel par ligne, tout-ou-rien.
export class CreateRosterRowDto {
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

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  birthDate?: Date;

  @IsOptional()
  @IsInt()
  jerseyNumber?: number;

  @IsOptional()
  @IsEnum(Position)
  mainPosition?: Position;

  @IsOptional()
  @IsArray()
  @IsEnum(Position, { each: true })
  secondaryPositions?: Position[];

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  joinDate?: Date;
}
