import { AbsenceReason } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

// Pas de champ reportedById : assigné automatiquement au membre à l'origine
// de la création (voir PlayerAbsencesService.create), jamais choisi dans un
// sélecteur — même convention que assignedById sur PlayerObjective. `reason`
// en liste fermée (statistiques par motif) ; `description` reste un texte
// libre optionnel pour préciser le contexte.
export class CreatePlayerAbsenceDto {
  @IsEnum(AbsenceReason)
  reason: AbsenceReason;

  @IsOptional()
  @IsString()
  description?: string;

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
