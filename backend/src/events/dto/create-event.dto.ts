import { EventType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateEventDto {
  @IsEnum(EventType)
  type: EventType;

  @IsString()
  @IsNotEmpty()
  title: string;

  // @Type(() => Date) convertit la chaîne ISO en Date avant validation
  // (voir CreatePlayerMeasurementDto pour le même besoin sur un champ Date).
  @Type(() => Date)
  @IsDate()
  startAt: Date;

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
}
