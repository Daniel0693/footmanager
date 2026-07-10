import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ArchivePlayerTeamDto } from './dto/archive-player-team.dto';
import { CreatePlayerTeamDto } from './dto/create-player-team.dto';
import { FindPlayerTeamsQueryDto } from './dto/find-player-teams-query.dto';
import { UpdatePlayerTeamDto } from './dto/update-player-team.dto';
import { PlayerTeamsService } from './player-teams.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/teams/:teamId/players')
export class PlayerTeamsController {
  constructor(private readonly playerTeamsService: PlayerTeamsService) {}

  @RequirePermission('player_team', 'CREATE')
  @Post()
  create(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: CreatePlayerTeamDto,
  ) {
    return this.playerTeamsService.create(clubId, teamId, dto);
  }

  @RequirePermission('player_team', 'READ')
  @Get()
  findAll(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Query() query: FindPlayerTeamsQueryDto,
  ) {
    return this.playerTeamsService.findAllByTeam(clubId, teamId, query);
  }

  @RequirePermission('player_team', 'UPDATE')
  @Patch(':id')
  update(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlayerTeamDto,
  ) {
    return this.playerTeamsService.update(clubId, teamId, id, dto);
  }

  @RequirePermission('player_team', 'UPDATE')
  @Patch(':id/archive')
  archive(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ArchivePlayerTeamDto,
  ) {
    return this.playerTeamsService.archive(clubId, teamId, id, dto.leaveDate);
  }

  @RequirePermission('player_team', 'DELETE')
  @Delete(':id')
  remove(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.playerTeamsService.remove(clubId, teamId, id);
  }
}
