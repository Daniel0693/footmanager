import { Foot } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class CreatePlayerProfileDto {
  @IsInt()
  memberId: number;

  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  // @Type(() => Date) convertit la chaîne ISO en Date avant validation :
  // Prisma (@db.Date) rejette une simple chaîne "AAAA-MM-JJ" en entrée client.
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  birthDate?: Date;

  @IsOptional()
  @IsEnum(Foot)
  preferredFoot?: Foot;
}
