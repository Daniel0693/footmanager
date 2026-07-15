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
import { CreateParentChildDto } from './dto/create-parent-child.dto';
import { ParentChildService } from './parent-child.service';

// Cette route ne porte pas de teamId dans l'URL : un Coach (rôle scopé TEAM
// sur `parent_child`) doit le transmettre en query (`?teamId=`) pour être
// autorisé — PermissionsGuard résout déjà clubId/teamId depuis params, body
// OU query (voir docs/modules/auth-roles.md §"Patterns découverts"). Ce
// teamId est en plus vérifié par le service (assertPlayerInTeam).
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/players/:playerId/parents')
export class ParentChildController {
  constructor(private readonly parentChildService: ParentChildService) {}

  @RequirePermission('parent_child', 'CREATE')
  @Post()
  create(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
    @Body() dto: CreateParentChildDto,
    @Query('teamId') teamId?: string,
  ) {
    return this.parentChildService.create(clubId, playerId, dto, {
      memberId: member.id,
      scope,
      teamId: teamId !== undefined ? Number(teamId) : undefined,
    });
  }

  @RequirePermission('parent_child', 'READ')
  @Get()
  findAll(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
    @Query('teamId') teamId?: string,
  ) {
    return this.parentChildService.findAllByPlayer(clubId, playerId, {
      memberId: member.id,
      scope,
      teamId: teamId !== undefined ? Number(teamId) : undefined,
    });
  }

  @RequirePermission('parent_child', 'DELETE')
  @Delete(':id')
  remove(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
    @Query('teamId') teamId?: string,
  ) {
    return this.parentChildService.remove(clubId, playerId, id, {
      memberId: member.id,
      scope,
      teamId: teamId !== undefined ? Number(teamId) : undefined,
    });
  }
}
