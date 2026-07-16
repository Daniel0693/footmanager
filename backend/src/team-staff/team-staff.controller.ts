import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Member, PermissionScope } from '@prisma/client';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { CurrentPermissionScope } from '../auth/decorators/current-permission-scope.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ArchiveTeamStaffDto } from './dto/archive-team-staff.dto';
import { CreateTeamStaffDto } from './dto/create-team-staff.dto';
import { UpdateTeamStaffDto } from './dto/update-team-staff.dto';
import { TeamStaffService } from './team-staff.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/teams/:teamId/staff')
export class TeamStaffController {
  constructor(private readonly teamStaffService: TeamStaffService) {}

  @RequirePermission('team_staff', 'CREATE')
  @Post()
  create(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: CreateTeamStaffDto,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
  ) {
    return this.teamStaffService.create(clubId, teamId, dto, {
      memberId: member.id,
      scope,
    });
  }

  @RequirePermission('team_staff', 'READ')
  @Get()
  findAll(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
  ) {
    return this.teamStaffService.findAllByTeam(clubId, teamId);
  }

  @RequirePermission('team_staff', 'UPDATE')
  @Patch(':id')
  update(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTeamStaffDto,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
  ) {
    return this.teamStaffService.update(clubId, teamId, id, dto, {
      memberId: member.id,
      scope,
    });
  }

  @RequirePermission('team_staff', 'UPDATE')
  @Patch(':id/archive')
  archive(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ArchiveTeamStaffDto,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
  ) {
    return this.teamStaffService.archive(
      clubId,
      teamId,
      id,
      { memberId: member.id, scope },
      dto.endDate,
    );
  }

  @RequirePermission('team_staff', 'DELETE')
  @Delete(':id')
  remove(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
  ) {
    return this.teamStaffService.remove(clubId, teamId, id, {
      memberId: member.id,
      scope,
    });
  }
}
