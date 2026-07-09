import { EventType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsIn, IsOptional } from 'class-validator';

// Filtrage/tri toujours côté backend (décision du 2026-07-06, voir
// docs/modules/effectif-joueurs.md §Mesures) : le frontend transmet ses
// critères en query, jamais de filtrage/tri en mémoire côté client.
export class FindEventsQueryDto {
  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateTo?: Date;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
