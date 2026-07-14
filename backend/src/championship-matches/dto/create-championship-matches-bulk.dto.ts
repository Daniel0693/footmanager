import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { CreateChampionshipMatchDto } from './create-championship-match.dto';

// Ajout en masse de rencontres (docs/roadmap.md B16, retour utilisateur —
// saisir un championnat complet une rencontre à la fois était trop lent) :
// même pattern que CreateEventsBulkDto (Calendrier, B4) — le frontend
// construit la liste (formulaire tableau, plusieurs lignes), le backend
// valide et crée tout dans une seule requête/transaction
// (ChampionshipMatchesService.createBulk), tout ou rien.
export class CreateChampionshipMatchesBulkDto {
  @ValidateNested({ each: true })
  @Type(() => CreateChampionshipMatchDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  matches: CreateChampionshipMatchDto[];
}
