import { ChampionshipMatchStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class FindChampionshipMatchesQueryDto {
  @IsOptional()
  @IsEnum(ChampionshipMatchStatus)
  status?: ChampionshipMatchStatus;
}
