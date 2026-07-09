import { Transform, Type } from 'class-transformer';
import { IsArray, IsDate, IsInt, IsOptional } from 'class-validator';

function splitCsv(value: unknown): string[] | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value.split(',').map((entry) => entry.trim());
}

// Même convention que FindMyEventsQueryDto (events/mine) : teamIds en CSV,
// dateFrom/dateTo bornent la fenêtre du calendrier affichée côté frontend.
export class FindBirthdaysQueryDto {
  @IsOptional()
  @Transform(({ value }) => splitCsv(value)?.map(Number))
  @IsArray()
  @IsInt({ each: true })
  teamIds?: number[];

  @Type(() => Date)
  @IsDate()
  dateFrom: Date;

  @Type(() => Date)
  @IsDate()
  dateTo: Date;
}
