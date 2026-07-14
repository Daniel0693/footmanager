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
import { ActivateSeasonDto } from './dto/activate-season.dto';
import { CreateSeasonDto } from './dto/create-season.dto';
import { FindSeasonsQueryDto } from './dto/find-seasons-query.dto';
import { UpdateSeasonDto } from './dto/update-season.dto';
import { SeasonsService } from './seasons.service';

// Ressource club-wide depuis la révision A14 (docs/roadmap.md) : cette route
// ne porte pas de teamId. Un Coach/Player (rôles scopés TEAM sur `season`,
// lecture seule) doit le transmettre en query (`?teamId=`) pour être
// autorisé — même pattern que `evaluation_config`, voir
// docs/modules/auth-roles.md §"Patterns découverts".
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/seasons')
export class SeasonsController {
  constructor(private readonly seasonsService: SeasonsService) {}

  @RequirePermission('season', 'CREATE')
  @Post()
  create(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Body() dto: CreateSeasonDto,
  ) {
    return this.seasonsService.create(clubId, dto);
  }

  @RequirePermission('season', 'READ')
  @Get()
  findAll(
    @Param('clubId', ParseIntPipe) clubId: number,
    @CurrentMember() member: Member,
    @Query() query: FindSeasonsQueryDto,
  ) {
    return this.seasonsService.findAllByClub(clubId, member.id, query);
  }

  @RequirePermission('season', 'READ')
  @Get(':id')
  findOne(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentMember() member: Member,
  ) {
    return this.seasonsService.findOne(clubId, id, member.id);
  }

  @RequirePermission('season', 'UPDATE')
  @Post(':id/activate')
  activate(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActivateSeasonDto,
  ) {
    return this.seasonsService.activate(clubId, id, dto.oldSeasonEndDate);
  }

  @RequirePermission('season', 'UPDATE')
  @Patch(':id')
  update(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSeasonDto,
  ) {
    return this.seasonsService.update(clubId, id, dto);
  }

  @RequirePermission('season', 'DELETE')
  @Delete(':id')
  remove(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.seasonsService.remove(clubId, id);
  }
}
