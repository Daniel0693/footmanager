import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdatePlayerAbsenceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @IsOptional()
  @IsBoolean()
  isExcused?: boolean;
}
