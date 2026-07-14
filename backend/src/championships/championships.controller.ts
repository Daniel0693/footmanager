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
import type { Member } from '@prisma/client';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ChampionshipsService } from './championships.service';
import { CreateChampionshipDto } from './dto/create-championship.dto';
import { FindChampionshipsQueryDto } from './dto/find-championships-query.dto';
import { UpdateChampionshipDto } from './dto/update-championship.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/teams/:teamId/championships')
export class ChampionshipsController {
  constructor(private readonly championshipsService: ChampionshipsService) {}

  @RequirePermission('championship', 'CREATE')
  @Post()
  create(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: CreateChampionshipDto,
  ) {
    return this.championshipsService.create(clubId, teamId, dto);
  }

  @RequirePermission('championship', 'READ')
  @Get()
  findAll(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @CurrentMember() member: Member,
    @Query() query: FindChampionshipsQueryDto,
  ) {
    return this.championshipsService.findAllByTeam(
      clubId,
      teamId,
      member.id,
      query,
    );
  }

  @RequirePermission('championship', 'READ')
  @Get(':id')
  findOne(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentMember() member: Member,
  ) {
    return this.championshipsService.findOne(clubId, teamId, id, member.id);
  }

  // Fonction pure (compute-standings.ts, B12) : calculé à la volée depuis
  // les ChampionshipMatch FINISHED, jamais persisté (pas de table Standing
  // en MVP — docs/modules/saisons-championnats.md §Classement).
  @RequirePermission('championship', 'READ')
  @Get(':id/standings')
  getStandings(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.championshipsService.getStandings(clubId, teamId, id);
  }

  @RequirePermission('championship', 'UPDATE')
  @Patch(':id')
  update(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateChampionshipDto,
  ) {
    return this.championshipsService.update(clubId, teamId, id, dto);
  }

  @RequirePermission('championship', 'DELETE')
  @Delete(':id')
  remove(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.championshipsService.remove(clubId, teamId, id);
  }
}
