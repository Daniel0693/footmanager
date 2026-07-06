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

// Pas de champ assignedById : assigné automatiquement au membre à l'origine
// de la création (voir PlayerObjectivesService.create), jamais choisi dans
// un sélecteur. `status`/`visibility` sont optionnels : la base applique
// PLANNED/SEMI_PRIVE par défaut si omis (docs/modules/effectif-joueurs.md —
// un défaut PRIVE était un bug identifié et corrigé).
export class CreatePlayerObjectiveDto {
  @IsEnum(ObjectiveTheme)
  theme: ObjectiveTheme;

  @IsString()
  @MinLength(1)
  description: string;

  @IsEnum(ObjectiveHorizon)
  horizon: ObjectiveHorizon;

  @IsOptional()
  @IsEnum(ObjectiveStatus)
  status?: ObjectiveStatus;

  @IsOptional()
  @IsEnum(NoteVisibility)
  visibility?: NoteVisibility;

  // @Type(() => Date) convertit la chaîne ISO en Date avant validation :
  // Prisma (@db.Date) rejette une simple chaîne "AAAA-MM-JJ" en entrée client.
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
