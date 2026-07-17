import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Member } from '@prisma/client';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { MatchPeriodsService } from './match-periods.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/teams/:teamId/matches/:matchId/periods')
export class MatchPeriodsController {
  constructor(private readonly matchPeriodsService: MatchPeriodsService) {}

  @RequirePermission('match_period', 'CREATE')
  @Post('start')
  startNext(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('matchId', ParseIntPipe) matchId: number,
  ) {
    return this.matchPeriodsService.startNext(clubId, teamId, matchId);
  }

  @RequirePermission('match_period', 'UPDATE')
  @Patch(':id/end')
  endCurrent(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('matchId', ParseIntPipe) matchId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.matchPeriodsService.endCurrent(clubId, teamId, matchId, id);
  }

  @RequirePermission('match_period', 'READ')
  @Get()
  findAll(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('matchId', ParseIntPipe) matchId: number,
    @CurrentMember() member: Member,
  ) {
    return this.matchPeriodsService.findAllByMatch(
      clubId,
      teamId,
      matchId,
      member.id,
    );
  }
}
