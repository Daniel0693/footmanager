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
import type { Member, PermissionScope } from '@prisma/client';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { CurrentPermissionScope } from '../auth/decorators/current-permission-scope.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreatePlayerObjectiveDto } from './dto/create-player-objective.dto';
import { FindPlayerObjectivesQueryDto } from './dto/find-player-objectives-query.dto';
import { UpdatePlayerObjectiveDto } from './dto/update-player-objective.dto';
import { PlayerObjectivesService } from './player-objectives.service';

// Cette route ne porte pas de teamId dans l'URL : un Coach (rôle scopé TEAM
// sur `player_objective`) doit le transmettre en query (`?teamId=`) pour
// être autorisé — PermissionsGuard résout déjà clubId/teamId depuis params,
// body OU query (voir docs/modules/auth-roles.md §"Patterns découverts"). Ce
// teamId est en plus vérifié par le service (assertPlayerInTeam) : le guard
// ne vérifie que le rôle du Coach sur cette équipe, jamais que le joueur
// ciblé y appartient réellement.
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/players/:playerId/objectives')
export class PlayerObjectivesController {
  constructor(
    private readonly playerObjectivesService: PlayerObjectivesService,
  ) {}

  @RequirePermission('player_objective', 'CREATE')
  @Post()
  create(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
    @Body() dto: CreatePlayerObjectiveDto,
    @Query('teamId') teamId?: string,
  ) {
    return this.playerObjectivesService.create(
      clubId,
      playerId,
      member.id,
      dto,
      {
        memberId: member.id,
        scope,
        teamId: teamId !== undefined ? Number(teamId) : undefined,
      },
    );
  }

  @RequirePermission('player_objective', 'READ')
  @Get()
  findAll(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
    @Query() query: FindPlayerObjectivesQueryDto,
    @Query('teamId') teamId?: string,
  ) {
    return this.playerObjectivesService.findAllByPlayer(
      clubId,
      playerId,
      {
        memberId: member.id,
        scope,
        teamId: teamId !== undefined ? Number(teamId) : undefined,
      },
      query,
    );
  }

  @RequirePermission('player_objective', 'UPDATE')
  @Patch(':id')
  update(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlayerObjectiveDto,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
    @Query('teamId') teamId?: string,
  ) {
    return this.playerObjectivesService.update(clubId, playerId, id, dto, {
      memberId: member.id,
      scope,
      teamId: teamId !== undefined ? Number(teamId) : undefined,
    });
  }

  @RequirePermission('player_objective', 'DELETE')
  @Delete(':id')
  remove(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
    @Query('teamId') teamId?: string,
  ) {
    return this.playerObjectivesService.remove(clubId, playerId, id, {
      memberId: member.id,
      scope,
      teamId: teamId !== undefined ? Number(teamId) : undefined,
    });
  }
}
