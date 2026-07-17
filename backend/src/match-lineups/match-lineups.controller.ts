import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { UpsertMatchLineupsBulkDto } from './dto/upsert-match-lineups-bulk.dto';
import { MatchLineupsService } from './match-lineups.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/teams/:teamId/matches/:matchId/lineups')
export class MatchLineupsController {
  constructor(private readonly matchLineupsService: MatchLineupsService) {}

  @RequirePermission('match_lineup', 'CREATE')
  @Post('bulk')
  upsertBulk(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('matchId', ParseIntPipe) matchId: number,
    @Body() dto: UpsertMatchLineupsBulkDto,
  ) {
    return this.matchLineupsService.upsertBulk(
      clubId,
      teamId,
      matchId,
      dto.entries,
    );
  }

  @RequirePermission('match_lineup', 'READ')
  @Get()
  findAll(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('matchId', ParseIntPipe) matchId: number,
  ) {
    return this.matchLineupsService.findAllByMatch(clubId, teamId, matchId);
  }

  @RequirePermission('match_lineup', 'DELETE')
  @Delete(':id')
  remove(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('matchId', ParseIntPipe) matchId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.matchLineupsService.remove(clubId, teamId, matchId, id);
  }
}
