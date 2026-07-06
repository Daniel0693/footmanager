import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdatePlayerInterviewDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @IsOptional()
  @IsString()
  @MinLength(1)
  subject?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  summary?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  staffFeedback?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  staffAssessment?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  playerFeedback?: string;
}
