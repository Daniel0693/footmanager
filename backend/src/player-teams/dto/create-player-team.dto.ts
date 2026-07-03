import { Position } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional } from 'class-validator';

export class CreatePlayerTeamDto {
  @IsInt()
  playerId: number;

  @IsOptional()
  @IsInt()
  jerseyNumber?: number;

  @IsOptional()
  @IsEnum(Position)
  mainPosition?: Position;

  @IsOptional()
  @IsEnum(Position)
  secondaryPosition?: Position;

  // @Type(() => Date) convertit la chaîne ISO en Date avant validation :
  // Prisma (@db.Date) rejette une simple chaîne "AAAA-MM-JJ" en entrée client.
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  joinDate?: Date;
}
