import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

export class ArchivePlayerTeamDto {
  // Défaut : aujourd'hui (voir PlayerTeamsService.archive) — un Coach peut
  // choisir une date passée/future précise (ex. fin de saison), sinon
  // archive "à effet immédiat".
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  leaveDate?: Date;
}
