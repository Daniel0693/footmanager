import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EvaluationScoreDto } from './create-player-evaluation.dto';

// Si `scores` est fourni, il remplace intégralement les scores existants de
// la session (pas de fusion partielle) — voir PlayerEvaluationsService.update.
export class UpdatePlayerEvaluationDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @IsOptional()
  @IsString()
  @MinLength(1)
  comments?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EvaluationScoreDto)
  scores?: EvaluationScoreDto[];
}
