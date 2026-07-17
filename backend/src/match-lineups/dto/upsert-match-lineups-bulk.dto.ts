import { LineupStatus, Position } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

// Une entrée de la composition d'un match. `position`/`shirtNumber` sont
// propres à CE match — jamais lus depuis PlayerTeam (docs/schema/evenements.md
// §MatchLineup), un dépannage à un poste inhabituel ne doit jamais modifier
// le poste principal du joueur dans l'effectif. `pitchSpotId` n'est pas
// validé contre une liste fermée côté backend : la liste des points du
// terrain (POSITION_PITCH_SPOTS) est une préoccupation purement visuelle,
// propre au frontend — la dupliquer ici créerait une seconde source de
// vérité à resynchroniser à chaque évolution du terrain.
export class UpsertMatchLineupEntryDto {
  @IsInt()
  playerId: number;

  @IsEnum(LineupStatus)
  lineupStatus: LineupStatus;

  @IsOptional()
  @IsEnum(Position)
  position?: Position;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  pitchSpotId?: string | null;

  @IsOptional()
  @IsInt()
  shirtNumber?: number;
}

// Composition envoyée en une fois, à chaque édition (docs/modules/matchs.md
// §Composition) — pas un ajout incrémental comme les convocations : le
// Coach resoumet l'état complet qu'il souhaite (titulaires, remplaçants,
// non-convoqués), le service upsert chaque ligne (MatchLineupsService
// .upsertBulk, B2).
export class UpsertMatchLineupsBulkDto {
  @ValidateNested({ each: true })
  @Type(() => UpsertMatchLineupEntryDto)
  @ArrayMinSize(1)
  entries: UpsertMatchLineupEntryDto[];
}
