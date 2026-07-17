import { TeamCategory } from '@prisma/client';
import { IsEnum, IsString, MinLength } from 'class-validator';

export class CreateTeamDto {
  @IsString()
  @MinLength(1)
  name: string;

  // Requise à la création (Phase 4, B10) — nullable en base seulement pour
  // les équipes existantes créées avant cette phase, voir
  // docs/schema/fondations.md §Team.
  @IsEnum(TeamCategory)
  category: TeamCategory;
}
