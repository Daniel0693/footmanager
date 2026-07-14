import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsString } from 'class-validator';

// `status` n'est jamais accepté en écriture ici : une Season créée via cette
// route est toujours DRAFT (docs/modules/saisons-championnats.md). Le passage
// à ACTIVE/ARCHIVED passe par l'endpoint dédié `SeasonsService.activate`.
export class CreateSeasonDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @Type(() => Date)
  @IsDate()
  startDate: Date;

  @Type(() => Date)
  @IsDate()
  endDate: Date;
}
