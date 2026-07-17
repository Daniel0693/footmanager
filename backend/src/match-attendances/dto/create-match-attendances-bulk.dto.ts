import { ArrayMinSize, ArrayUnique, IsInt } from 'class-validator';

// Convocation en masse (docs/modules/matchs.md §Convocations) : le Coach
// sélectionne les joueurs convoqués depuis l'effectif en une seule action,
// pas un par un. Idempotent côté service — un joueur déjà convoqué n'est
// jamais dupliqué ni réinitialisé (MatchAttendancesService.createBulk).
export class CreateMatchAttendancesBulkDto {
  @IsInt({ each: true })
  @ArrayMinSize(1)
  @ArrayUnique()
  playerIds: number[];
}
