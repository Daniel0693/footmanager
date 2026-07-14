import { ChampionshipMatchStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, Min } from 'class-validator';

// `matchId` totalement absent — voir CreateChampionshipMatchDto. Le passage
// à FINISHED exige scoreHome/scoreAway non-null (vérifié dans le service,
// pas exprimable en décorateur puisque ça dépend de la valeur d'un autre
// champ ET de l'état déjà persisté).
export class UpdateChampionshipMatchDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledAt?: Date;

  @IsOptional()
  @IsInt()
  scoreHome?: number;

  @IsOptional()
  @IsInt()
  scoreAway?: number;

  @IsOptional()
  @IsEnum(ChampionshipMatchStatus)
  status?: ChampionshipMatchStatus;

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
