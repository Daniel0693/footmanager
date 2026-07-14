import { IsInt, IsOptional } from 'class-validator';

// Exactement l'un des deux doit être renseigné — vérifié dans le service
// (pas de contrainte SQL native pour ce "exactement un de X/Y" avec Prisma).
export class CreateChampionshipParticipantDto {
  @IsOptional()
  @IsInt()
  internalTeamId?: number;

  @IsOptional()
  @IsInt()
  externalTeamId?: number;
}
