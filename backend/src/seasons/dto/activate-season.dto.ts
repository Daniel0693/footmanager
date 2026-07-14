import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

// Permet de corriger la endDate de l'ancienne saison ACTIVE du club au moment
// de l'activation de la nouvelle (ex. nouvelle saison créée en août alors que
// l'ancienne se terminait officiellement en juin). Absent = conserve
// l'endDate déjà enregistrée. Voir docs/modules/saisons-championnats.md.
export class ActivateSeasonDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  oldSeasonEndDate?: Date;
}
