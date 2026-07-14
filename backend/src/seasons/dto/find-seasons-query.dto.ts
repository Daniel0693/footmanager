import { SeasonStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

// Filtrage toujours côté backend (convention du projet) : le frontend
// transmet ses critères en query, jamais de filtrage en mémoire côté client.
export class FindSeasonsQueryDto {
  @IsOptional()
  @IsEnum(SeasonStatus)
  status?: SeasonStatus;
}
