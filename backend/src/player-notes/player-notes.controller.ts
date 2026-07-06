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
import { CreatePlayerNoteDto } from './dto/create-player-note.dto';
import { FindPlayerNotesQueryDto } from './dto/find-player-notes-query.dto';
import { UpdatePlayerNoteDto } from './dto/update-player-note.dto';
import { PlayerNotesService } from './player-notes.service';

// Cette route ne porte pas de teamId dans l'URL : un Coach (rôle scopé TEAM
// sur `player_note`) doit le transmettre en query (`?teamId=`) pour être
// autorisé — PermissionsGuard résout déjà clubId/teamId depuis params, body
// OU query (voir docs/modules/auth-roles.md §"Patterns découverts"). Ce
// teamId est en plus vérifié par le service (assertPlayerInTeam) : le guard
// ne vérifie que le rôle du Coach sur cette équipe, jamais que le joueur
// ciblé y appartient réellement.
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/players/:playerId/notes')
export class PlayerNotesController {
  constructor(private readonly playerNotesService: PlayerNotesService) {}

  @RequirePermission('player_note', 'CREATE')
  @Post()
  create(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
    @Body() dto: CreatePlayerNoteDto,
    @Query('teamId') teamId?: string,
  ) {
    return this.playerNotesService.create(clubId, playerId, member.id, dto, {
      memberId: member.id,
      scope,
      teamId: teamId !== undefined ? Number(teamId) : undefined,
    });
  }

  @RequirePermission('player_note', 'READ')
  @Get()
  findAll(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
    @Query() query: FindPlayerNotesQueryDto,
    @Query('teamId') teamId?: string,
  ) {
    return this.playerNotesService.findAllByPlayer(
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

  @RequirePermission('player_note', 'UPDATE')
  @Patch(':id')
  update(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlayerNoteDto,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
    @Query('teamId') teamId?: string,
  ) {
    return this.playerNotesService.update(clubId, playerId, id, dto, {
      memberId: member.id,
      scope,
      teamId: teamId !== undefined ? Number(teamId) : undefined,
    });
  }

  @RequirePermission('player_note', 'DELETE')
  @Delete(':id')
  remove(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
    @Query('teamId') teamId?: string,
  ) {
    return this.playerNotesService.remove(clubId, playerId, id, {
      memberId: member.id,
      scope,
      teamId: teamId !== undefined ? Number(teamId) : undefined,
    });
  }
}
