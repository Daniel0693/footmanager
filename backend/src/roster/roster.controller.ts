import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Member } from '@prisma/client';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
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
}
