import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

// Pas de champ reportedById : assigné automatiquement au membre à l'origine
// de la création (voir PlayerAbsencesService.create), jamais choisi dans un
// sélecteur — même convention que assignedById sur PlayerObjective.
export class CreatePlayerAbsenceDto {
  @IsString()
  @MinLength(1)
  reason: string;

  // @Type(() => Date) convertit la chaîne ISO en Date avant validation :
  // Prisma (@db.Date) rejette une simple chaîne "AAAA-MM-JJ" en entrée client.
  @Type(() => Date)
  @IsDate()
  startDate: Date;

  @Type(() => Date)
  @IsDate()
  endDate: Date;

  @IsOptional()
  @IsBoolean()
  isExcused?: boolean;
}
