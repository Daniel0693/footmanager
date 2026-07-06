import { MeasurementType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsNumber } from 'class-validator';

export class CreatePlayerMeasurementDto {
  @IsEnum(MeasurementType)
  type: MeasurementType;

  @IsNumber()
  value: number;

  // @Type(() => Date) convertit la chaîne ISO en Date avant validation :
  // Prisma (@db.Date) rejette une simple chaîne "AAAA-MM-JJ" en entrée client.
  @Type(() => Date)
  @IsDate()
  date: Date;
}
