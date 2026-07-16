import { Foot } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CreateRosterRowDto } from './create-roster-row.dto';

// Une ligne d'import (mappée par l'utilisateur depuis les colonnes de son
// fichier, docs/modules/effectif-joueurs.md §Import) — étend CreateRosterRowDto
// (B4, bulk create manuel) plutôt que de dupliquer ses champs, en ajoutant
// les trois champs d'identité PlayerProfile qui manquaient à B4
// (licenseNumber/nationality/preferredFoot, jamais demandés par le bulk
// manuel jusqu'ici mais nécessaires ici pour le rapprochement par licence).
export class ImportRowInputDto extends CreateRosterRowDto {
  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsEnum(Foot)
  preferredFoot?: Foot;
}
