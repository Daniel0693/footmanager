import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
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
import { CreatePlayerMeasurementDto } from './dto/create-player-measurement.dto';
import { FindPlayerMeasurementsQueryDto } from './dto/find-player-measurements-query.dto';
import { PlayerMeasurementsService } from './player-measurements.service';

// Cette route ne porte pas de teamId dans l'URL : un Coach (rôle scopé TEAM
// sur `player_measurement`) doit le transmettre en query (`?teamId=`) pour
// être autorisé — PermissionsGuard résout déjà clubId/teamId depuis params,
// body OU query (voir docs/modules/auth-roles.md §"Patterns découverts").
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/players/:playerId/measurements')
export class PlayerMeasurementsController {
  constructor(
    private readonly playerMeasurementsService: PlayerMeasurementsService,
  ) {}

  @RequirePermission('player_measurement', 'CREATE')
  @Post()
  create(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @Body() dto: CreatePlayerMeasurementDto,
  ) {
    return this.playerMeasurementsService.create(clubId, playerId, dto);
  }

  @RequirePermission('player_measurement', 'READ')
  @Get()
  findAll(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
    @Query() query: FindPlayerMeasurementsQueryDto,
  ) {
    return this.playerMeasurementsService.findAllByPlayer(
      clubId,
      playerId,
      { memberId: member.id, scope },
      query,
    );
  }

  @RequirePermission('player_measurement', 'DELETE')
  @Delete(':id')
  remove(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.playerMeasurementsService.remove(clubId, playerId, id);
  }
}
