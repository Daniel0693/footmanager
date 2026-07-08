import { EventType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
} from 'class-validator';

function splitCsv(value: unknown): string[] | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value.split(',').map((entry) => entry.trim());
}

// Filtres de la barre latérale du calendrier (docs/modules/calendrier-evenements.md
// §Filtres) : listes en un seul paramètre séparé par virgules (ex.
// ?types=TRAINING,MATCH), plus simple à construire côté frontend que des clés
// de query répétées. Résolu côté backend comme le reste du filtrage/tri de
// l'application (décision du 2026-07-06) — distinct du `type` singulier de
// FindEventsQueryDto (CRUD scopé équipe, findAllByTeam).
export class FindMyEventsQueryDto {
  @IsOptional()
  @Transform(({ value }) => splitCsv(value))
  @IsArray()
  @IsEnum(EventType, { each: true })
  types?: EventType[];

  @IsOptional()
  @Transform(({ value }) => splitCsv(value)?.map(Number))
  @IsArray()
  @IsInt({ each: true })
  teamIds?: number[];

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
