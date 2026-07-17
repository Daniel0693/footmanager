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
import { CreateMatchAttendancesBulkDto } from './dto/create-match-attendances-bulk.dto';
import { UpdateMatchAttendanceDto } from './dto/update-match-attendance.dto';
import { MatchAttendancesService } from './match-attendances.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/teams/:teamId/matches/:matchId/attendances')
export class MatchAttendancesController {
  constructor(
    private readonly matchAttendancesService: MatchAttendancesService,
  ) {}

  @RequirePermission('match_attendance', 'CREATE')
  @Post('bulk')
  createBulk(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('matchId', ParseIntPipe) matchId: number,
    @Body() dto: CreateMatchAttendancesBulkDto,
  ) {
    return this.matchAttendancesService.createBulk(
      clubId,
      teamId,
      matchId,
      dto.playerIds,
    );
  }

  @RequirePermission('match_attendance', 'READ')
  @Get()
  findAll(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('matchId', ParseIntPipe) matchId: number,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
  ) {
    return this.matchAttendancesService.findAllByMatch(
      clubId,
      teamId,
      matchId,
      {
        memberId: member.id,
        scope,
      },
    );
  }

  @RequirePermission('match_attendance', 'UPDATE')
  @Patch(':id')
  update(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('matchId', ParseIntPipe) matchId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMatchAttendanceDto,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
  ) {
    return this.matchAttendancesService.update(
      clubId,
      teamId,
      matchId,
      id,
      dto,
      {
        memberId: member.id,
        scope,
      },
    );
  }

  @RequirePermission('match_attendance', 'DELETE')
  @Delete(':id')
  remove(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('matchId', ParseIntPipe) matchId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.matchAttendancesService.remove(clubId, teamId, matchId, id);
  }
}
