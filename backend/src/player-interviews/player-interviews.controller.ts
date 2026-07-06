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
import { CreatePlayerInterviewDto } from './dto/create-player-interview.dto';
import { FindPlayerInterviewsQueryDto } from './dto/find-player-interviews-query.dto';
import { UpdatePlayerInterviewDto } from './dto/update-player-interview.dto';
import { PlayerInterviewsService } from './player-interviews.service';

// Cette route ne porte pas de teamId dans l'URL : un Coach (rôle scopé TEAM
// sur `player_interview`) doit le transmettre en query (`?teamId=`) pour
// être autorisé — PermissionsGuard résout déjà clubId/teamId depuis params,
// body OU query (voir docs/modules/auth-roles.md §"Patterns découverts").
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/players/:playerId/interviews')
export class PlayerInterviewsController {
  constructor(
    private readonly playerInterviewsService: PlayerInterviewsService,
  ) {}

  @RequirePermission('player_interview', 'CREATE')
  @Post()
  create(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @CurrentMember() member: Member,
    @Body() dto: CreatePlayerInterviewDto,
  ) {
    return this.playerInterviewsService.create(
      clubId,
      playerId,
      member.id,
      dto,
    );
  }

  @RequirePermission('player_interview', 'READ')
  @Get()
  findAll(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
    @Query() query: FindPlayerInterviewsQueryDto,
  ) {
    return this.playerInterviewsService.findAllByPlayer(
      clubId,
      playerId,
      { memberId: member.id, scope },
      query,
    );
  }

  @RequirePermission('player_interview', 'UPDATE')
  @Patch(':id')
  update(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlayerInterviewDto,
  ) {
    return this.playerInterviewsService.update(clubId, playerId, id, dto);
  }

  @RequirePermission('player_interview', 'DELETE')
  @Delete(':id')
  remove(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.playerInterviewsService.remove(clubId, playerId, id);
  }
}
