import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// `status` volontairement absent : toujours modifié via l'endpoint dédié
// `activate`, jamais par une édition libre — voir CreateSeasonDto. Une Season
// ARCHIVED reste éditable via cette route (pas de verrou, comportement
// documenté dans docs/modules/saisons-championnats.md).
export class UpdateSeasonDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}
