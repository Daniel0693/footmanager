import { TeamStaffRole } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional } from 'class-validator';

export class UpdateTeamStaffDto {
  @IsOptional()
  @IsEnum(TeamStaffRole)
  staffRole?: TeamStaffRole;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}
