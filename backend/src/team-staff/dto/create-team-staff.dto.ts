import { TeamStaffRole } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional } from 'class-validator';

export class CreateTeamStaffDto {
  @IsInt()
  memberId: number;

  @IsEnum(TeamStaffRole)
  staffRole: TeamStaffRole;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;
}
