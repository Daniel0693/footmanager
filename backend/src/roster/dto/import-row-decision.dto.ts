import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsInt,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { ImportRowInputDto } from './import-row-input.dto';
import { MAX_IMPORT_ROWS } from '../roster-import.service';

// Décision prise par l'utilisateur pour une ligne, à l'issue de l'écran de
// prévisualisation (docs/modules/effectif-joueurs.md §Import, étape 4) — le
// backend agit sur cette décision déjà prise, il ne rejoue jamais la cascade
// de rapprochement à cette étape (RosterMatchingService n'intervient qu'à
// l'étape 3, preview).
//
// - CREATE : nouveau Member + PlayerProfile + PlayerTeam (ni playerId ni
//   playerTeamId nécessaires).
// - UPDATE (statut MODIFICATION accepté) : met à jour le Member/PlayerProfile
//   existants ET l'affectation PlayerTeam ciblée (playerId + playerTeamId
//   requis) — seul cas où les champs d'identité de la ligne sont réellement
//   appliqués à un profil existant.
// - REACTIVATE (statut RÉACTIVATION accepté, ou candidat choisi sur AMBIGU) :
//   réutilise le PlayerProfile existant (playerId requis), crée uniquement
//   une nouvelle affectation PlayerTeam — jamais de mise à jour du
//   Member/PlayerProfile, même convention que la réactivation dans
//   PlayerFormDialog (les champs d'identité de la ligne sont ignorés).
export class ImportRowDecisionDto {
  @IsIn(['CREATE', 'UPDATE', 'REACTIVATE'])
  action: 'CREATE' | 'UPDATE' | 'REACTIVATE';

  @IsOptional()
  @IsInt()
  playerId?: number;

  @IsOptional()
  @IsInt()
  playerTeamId?: number;

  @ValidateNested()
  @Type(() => ImportRowInputDto)
  row: ImportRowInputDto;
}

export class CommitImportDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IMPORT_ROWS)
  @ValidateNested({ each: true })
  @Type(() => ImportRowDecisionDto)
  decisions: ImportRowDecisionDto[];
}
