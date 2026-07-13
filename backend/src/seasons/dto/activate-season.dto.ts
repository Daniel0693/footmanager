import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

// Étape 4 du wizard (docs/modules/saisons-championnats.md) : permet de
// corriger la endDate de l'ancienne saison au moment de l'activation (ex.
// nouvelle saison créée en août alors que l'ancienne se terminait
// officiellement en juin). Absent = conserve l'endDate déjà enregistrée.
export class ActivateSeasonDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  oldSeasonEndDate?: Date;
}
