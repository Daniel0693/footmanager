import { CupRound, GameFormat, HomeOrAway, MatchType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

// Création directe depuis le Calendrier (docs/modules/matchs.md) — réservée
// à COUPE/AMICAL/TOURNOI, jamais CHAMPIONNAT (rejeté dans MatchesService.create,
// pas exprimable en décorateur puisqu'il s'agit d'une règle métier, pas
// d'une contrainte structurelle du DTO). `opponentExternalTeamId` remplace
// le opponentName en texte libre initialement envisagé (docs/schema/evenements.md).
export class CreateMatchDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @Type(() => Date)
  @IsDate()
  startAt: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endAt?: Date;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(MatchType)
  matchType: MatchType;

  @IsInt()
  opponentExternalTeamId: number;

  // Requis si matchType = COUPE, absent sinon (vérifié dans le service —
  // ValidateIf ne couvre que le cas "requis quand COUPE", pas l'inverse).
  @ValidateIf((o: CreateMatchDto) => o.matchType === 'COUPE')
  @IsEnum(CupRound)
  cupRound?: CupRound;

  @IsEnum(HomeOrAway)
  homeOrAway: HomeOrAway;

  @IsOptional()
  @IsInt()
  @Min(1)
  numberOfPeriods?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  periodDurationMinutes?: number;

  // Pré-rempli côté frontend depuis Team.category (Phase 4, B10) — optionnel
  // ici (comme numberOfPeriods/periodDurationMinutes ci-dessus), aucun
  // format n'est imposé par défaut si omis (reste `null`).
  @IsOptional()
  @IsEnum(GameFormat)
  gameFormat?: GameFormat;
}
