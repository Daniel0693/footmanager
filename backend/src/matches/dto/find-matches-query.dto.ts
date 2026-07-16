import { LiveMatchStatus, MatchType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

// Filtres basiques (par équipe) — le filtrage transverse par saison/
// championnat(s) pour l'historique/les statistiques arrive en Partie D
// (D4), qui a besoin de jointures supplémentaires non nécessaires ici.
export class FindMatchesQueryDto {
  @IsOptional()
  @IsEnum(MatchType)
  matchType?: MatchType;

  @IsOptional()
  @IsEnum(LiveMatchStatus)
  status?: LiveMatchStatus;
}
