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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreatePlayerProfileDto } from './dto/create-player-profile.dto';
import { UpdatePlayerProfileDto } from './dto/update-player-profile.dto';
import { PlayersService } from './players.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/players')
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @RequirePermission('player_profile', 'CREATE')
  @Post()
  create(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Body() dto: CreatePlayerProfileDto,
  ) {
    return this.playersService.create(clubId, dto);
  }

  @RequirePermission('player_profile', 'READ')
  @Get()
  findAll(
    @Param('clubId', ParseIntPipe) clubId: number,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
  ) {
    return this.playersService.findAllByClub(clubId, {
      memberId: member.id,
      scope,
    });
  }

  // Pas de @RequirePermission ici : lecture de son propre profil par
  // construction (voir PlayersService.findMe). Doit être déclaré avant
  // `:id` pour que 'me' ne soit pas capturé comme un id numérique.
  @Get('me')
  findMe(
    @Param('clubId', ParseIntPipe) clubId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.playersService.findMe(clubId, user.userId);
  }

  @RequirePermission('player_profile', 'READ')
  @Get(':id')
  findOne(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
    @Query('teamId') teamId?: string,
  ) {
    return this.playersService.findOne(clubId, id, {
      memberId: member.id,
      scope,
      teamId: teamId !== undefined ? Number(teamId) : undefined,
    });
  }

  @RequirePermission('player_profile', 'UPDATE')
  @Patch(':id')
  update(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlayerProfileDto,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
    @Query('teamId') teamId?: string,
  ) {
    return this.playersService.update(clubId, id, dto, {
      memberId: member.id,
      scope,
      teamId: teamId !== undefined ? Number(teamId) : undefined,
    });
  }

  @RequirePermission('player_profile', 'DELETE')
  @Delete(':id')
  remove(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
    @Query('teamId') teamId?: string,
  ) {
    return this.playersService.remove(clubId, id, {
      memberId: member.id,
      scope,
      teamId: teamId !== undefined ? Number(teamId) : undefined,
    });
  }
}
