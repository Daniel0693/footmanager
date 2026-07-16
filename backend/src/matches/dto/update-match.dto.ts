import { CupRound, HomeOrAway } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

// `matchType`/`championshipMatchId` absents — immuables après création
// (docs/modules/matchs.md) : un match mal typé se supprime et se recrée,
// pas de logique de conversion. `opponentExternalTeamId`/`cupRound` restent
// modifiables ici, mais MatchesService.update rejette toute tentative sur
// un match matchType = CHAMPIONNAT (adversaire dérivé, jamais stocké).
export class UpdateMatchDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endAt?: Date;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  opponentExternalTeamId?: number;

  @IsOptional()
  @IsEnum(CupRound)
  cupRound?: CupRound;

  @IsOptional()
  @IsEnum(HomeOrAway)
  homeOrAway?: HomeOrAway;

  @IsOptional()
  @IsInt()
  @Min(1)
  numberOfPeriods?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  periodDurationMinutes?: number;
}
