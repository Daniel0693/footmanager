import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { TIEBREAKER_RULES } from '../tiebreaker-rule';

export class UpdateChampionshipDto {
  @IsOptional()
  @IsInt()
  seasonId?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

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

  @IsOptional()
  @IsArray()
  @IsIn(TIEBREAKER_RULES, { each: true })
  tiebreakerRules?: string[];

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
}
