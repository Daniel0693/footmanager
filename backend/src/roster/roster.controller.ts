import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Member } from '@prisma/client';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { BulkCreateRosterDto } from './dto/bulk-create-roster.dto';
import { BulkUpdateRosterDto } from './dto/bulk-update-roster.dto';
import { FindRosterQueryDto } from './dto/find-roster-query.dto';
import { RosterService } from './roster.service';

// Gardé par player_team READ (ressource principale du tableau unifié) : le
// staff n'est qu'un enrichissement — voir RosterService.findStaffRows, qui
// dégrade silencieusement (staff omis, pas de 403) si l'appelant n'a pas
// team_staff READ. roster_archive READ est vérifié séparément, uniquement
// quand ?status= diffère du défaut ACTIVE (voir RosterService).
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/teams/:teamId/roster')
export class RosterController {
  constructor(private readonly rosterService: RosterService) {}

  @RequirePermission('player_team', 'READ')
  @Get()
  findAll(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @CurrentMember() member: Member,
    @Query() query: FindRosterQueryDto,
  ) {
    return this.rosterService.findAllByTeam(
      { memberId: member.id, clubId, teamId },
      query,
    );
  }

  // Coach ET AdminClub/SuperAdmin/Proprietaire (player_team CREATE/UPDATE
  // déjà scopé TEAM/CLUB/ALL dans le seed) — pas de permission nouvelle,
  // même ressource que la création/édition unitaire existante.
  @RequirePermission('player_team', 'CREATE')
  @Post('bulk')
  bulkCreate(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: BulkCreateRosterDto,
  ) {
    return this.rosterService.bulkCreate(clubId, teamId, dto.items);
  }

  @RequirePermission('player_team', 'UPDATE')
  @Patch('bulk')
  bulkUpdate(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: BulkUpdateRosterDto,
  ) {
    return this.rosterService.bulkUpdate(clubId, teamId, dto.items);
  }
}
