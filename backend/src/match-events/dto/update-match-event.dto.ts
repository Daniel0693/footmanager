import { IsInt, IsOptional, IsString, Min } from 'class-validator';

// `type`/`teamSide` absents — immuables après création, même convention que
// `Match.matchType` (docs/modules/matchs.md) : un événement mal typé se
// supprime et se recrée, pas de logique de conversion. Les références
// joueur restent re-validées contre le type/teamSide EXISTANT de
// l'événement (MatchEventsService.update).
export class UpdateMatchEventDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  periodNumber?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minute?: number;

  @IsOptional()
  @IsInt()
  playerId?: number;

  @IsOptional()
  @IsInt()
  relatedPlayerId?: number;

  @IsOptional()
  @IsInt()
  externalPlayerId?: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
