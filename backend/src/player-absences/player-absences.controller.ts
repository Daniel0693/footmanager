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
import { CreatePlayerAbsenceDto } from './dto/create-player-absence.dto';
import { FindPlayerAbsencesQueryDto } from './dto/find-player-absences-query.dto';
import { UpdatePlayerAbsenceDto } from './dto/update-player-absence.dto';
import { PlayerAbsencesService } from './player-absences.service';

// Cette route ne porte pas de teamId dans l'URL : un Coach (rôle scopé TEAM
// sur `player_absence`) doit le transmettre en query (`?teamId=`) pour être
// autorisé — PermissionsGuard résout déjà clubId/teamId depuis params, body
// OU query (voir docs/modules/auth-roles.md §"Patterns découverts"). Ce
// teamId est en plus vérifié par le service (assertPlayerInTeam) : le guard
// ne vérifie que le rôle du Coach sur cette équipe, jamais que le joueur
// ciblé y appartient réellement.
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/players/:playerId/absences')
export class PlayerAbsencesController {
  constructor(private readonly playerAbsencesService: PlayerAbsencesService) {}

  @RequirePermission('player_absence', 'CREATE')
  @Post()
  create(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
    @Body() dto: CreatePlayerAbsenceDto,
    @Query('teamId') teamId?: string,
  ) {
    return this.playerAbsencesService.create(clubId, playerId, member.id, dto, {
      memberId: member.id,
      scope,
      teamId: teamId !== undefined ? Number(teamId) : undefined,
    });
  }

  @RequirePermission('player_absence', 'READ')
  @Get()
  findAll(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
    @Query() query: FindPlayerAbsencesQueryDto,
    @Query('teamId') teamId?: string,
  ) {
    return this.playerAbsencesService.findAllByPlayer(
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

  @RequirePermission('player_absence', 'UPDATE')
  @Patch(':id')
  update(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlayerAbsenceDto,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
    @Query('teamId') teamId?: string,
  ) {
    return this.playerAbsencesService.update(clubId, playerId, id, dto, {
      memberId: member.id,
      scope,
      teamId: teamId !== undefined ? Number(teamId) : undefined,
    });
  }

  @RequirePermission('player_absence', 'DELETE')
  @Delete(':id')
  remove(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
    @Query('teamId') teamId?: string,
  ) {
    return this.playerAbsencesService.remove(clubId, playerId, id, {
      memberId: member.id,
      scope,
      teamId: teamId !== undefined ? Number(teamId) : undefined,
    });
  }
}
