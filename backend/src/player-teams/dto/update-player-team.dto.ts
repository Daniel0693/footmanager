import { Position } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional } from 'class-validator';

export class UpdatePlayerTeamDto {
  @IsOptional()
  @IsInt()
  jerseyNumber?: number;

  @IsOptional()
  @IsEnum(Position)
  mainPosition?: Position;

  @IsOptional()
  @IsEnum(Position)
  secondaryPosition?: Position;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  joinDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  leaveDate?: Date;
}
