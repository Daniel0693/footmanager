import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// `status` n'est jamais accepté en écriture ici : une Season créée via cette
// route est toujours DRAFT (docs/modules/saisons-championnats.md — wizard de
// transition de saison, étape 1). Le passage à ACTIVE/ARCHIVED passe par les
// endpoints dédiés du wizard (SeasonsService.activate, étape A9).
export class CreateSeasonDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  teamNameSnapshot?: string;

  @IsOptional()
  @IsString()
  categorySnapshot?: string;

  @Type(() => Date)
  @IsDate()
  startDate: Date;

  @Type(() => Date)
  @IsDate()
  endDate: Date;
}
