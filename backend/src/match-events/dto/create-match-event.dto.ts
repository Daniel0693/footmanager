import { MatchEventType, TeamSide } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

// Événement live/post-match (docs/schema/evenements.md §MatchEvent) — quels
// champs joueur sont requis/interdits dépend de `type` ET de `teamSide`
// (notre équipe vs adversaire, déterminé en comparant à Match.homeOrAway) :
// règle métier, pas exprimable en décorateurs de classe, validée dans
// MatchEventsService.assertValidPlayerReferences.
export class CreateMatchEventDto {
  @IsEnum(MatchEventType)
  type: MatchEventType;

  @IsEnum(TeamSide)
  teamSide: TeamSide;

  @IsOptional()
  @IsInt()
  @Min(1)
  periodNumber?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minute?: number;

  // Notre joueur : buteur/auteur du csc, joueur cartonné, joueur ENTRANT
  // (SUBSTITUTION), tireur (PENALTY_SCORED/MISSED).
  @IsOptional()
  @IsInt()
  playerId?: number;

  // Passeur décisif (GOAL) ou joueur SORTANT (SUBSTITUTION).
  @IsOptional()
  @IsInt()
  relatedPlayerId?: number;

  // Joueur adverse impliqué — reste optionnel même pour un événement côté
  // adversaire (retour utilisateur du 2026-07-18) : un but/carton adverse
  // doit pouvoir être enregistré sans nommer de joueur suivi.
  @IsOptional()
  @IsInt()
  externalPlayerId?: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
