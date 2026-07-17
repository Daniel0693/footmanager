import { GameFormat } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { TIEBREAKER_RULES } from '../tiebreaker-rule';

export class CreateChampionshipDto {
  @IsInt()
  seasonId: number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @Type(() => Date)
  @IsDate()
  startDate: Date;

  @Type(() => Date)
  @IsDate()
  endDate: Date;

  @IsOptional()
  @IsInt()
  @Min(0)
  pointsForWin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  pointsForDraw?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  pointsForLoss?: number;

  @IsArray()
  @IsIn(TIEBREAKER_RULES, { each: true })
  tiebreakerRules: string[];

  @IsOptional()
  @IsString()
  tiebreakerPreset?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  numberOfPeriods?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  periodDurationMinutes?: number;

  // Format de jeu (Phase 4, B10) — pré-rempli côté frontend depuis
  // Team.category, mais optionnel ici : le schéma retombe sur
  // GameFormat.ELEVEN si omis (même défaut que numberOfPeriods/
  // periodDurationMinutes ci-dessus).
  @IsOptional()
  @IsEnum(GameFormat)
  gameFormat?: GameFormat;
}
