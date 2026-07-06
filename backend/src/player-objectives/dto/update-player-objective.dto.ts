import {
  ObjectiveHorizon,
  ObjectiveStatus,
  ObjectiveTheme,
  NoteVisibility,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdatePlayerObjectiveDto {
  @IsOptional()
  @IsEnum(ObjectiveTheme)
  theme?: ObjectiveTheme;

  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsEnum(ObjectiveHorizon)
  horizon?: ObjectiveHorizon;

  @IsOptional()
  @IsEnum(ObjectiveStatus)
  status?: ObjectiveStatus;

  @IsOptional()
  @IsEnum(NoteVisibility)
  visibility?: NoteVisibility;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  completedDate?: Date;
}
