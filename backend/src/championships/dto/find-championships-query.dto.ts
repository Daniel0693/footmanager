import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

export class FindChampionshipsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  seasonId?: number;
}
