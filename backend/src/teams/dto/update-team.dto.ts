import { TeamCategory } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateTeamDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsEnum(TeamCategory)
  category?: TeamCategory;
}
