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

// Une ligne de mise à jour en masse (B4) : `id` cible le PlayerTeam existant
// (voir RosterRow.id) — même identifiant que celui affiché par le tableau
// unifié, pas le memberId.
export class UpdateRosterRowDto {
  @IsInt()
  id: number;

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

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  leaveDate?: Date;
}
