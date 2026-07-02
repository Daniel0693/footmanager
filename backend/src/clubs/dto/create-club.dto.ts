import { SportType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateClubDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  country: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsEnum(SportType)
  sport?: SportType;

  // Renseignent le Member créé pour l'utilisateur courant dans ce club.
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
