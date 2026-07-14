import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, Min } from 'class-validator';

// Toujours créée en SCHEDULED (status non exposé ici) : le passage à
// FINISHED/CANCELLED/POSTPONED passe par la mise à jour dédiée. `matchId`
// est totalement absent de ce DTO — hors scope Phase 3 (Match arrive en
// Phase 4), voir schema.prisma §ChampionshipMatch.
export class CreateChampionshipMatchDto {
  @IsInt()
  homeParticipantId: number;

  @IsInt()
  awayParticipantId: number;

  @Type(() => Date)
  @IsDate()
  scheduledAt: Date;

  @IsOptional()
  @IsInt()
  round?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  numberOfPeriods?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  periodDurationMinutes?: number;
}
