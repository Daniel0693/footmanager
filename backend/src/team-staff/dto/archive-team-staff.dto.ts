import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

export class ArchiveTeamStaffDto {
  // Défaut : aujourd'hui (voir TeamStaffService.archive).
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}
