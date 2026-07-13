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
import { CreateSeasonDto } from './dto/create-season.dto';
import { FindSeasonsQueryDto } from './dto/find-seasons-query.dto';
import { ImportSeasonRosterDto } from './dto/import-season-roster.dto';
import { UpdateSeasonDto } from './dto/update-season.dto';
import { SeasonRosterImportService } from './season-roster-import.service';
import { SeasonsService } from './seasons.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/teams/:teamId/seasons')
export class SeasonsController {
  constructor(
    private readonly seasonsService: SeasonsService,
    private readonly seasonRosterImportService: SeasonRosterImportService,
  ) {}

  @RequirePermission('season', 'CREATE')
  @Post()
  create(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: CreateSeasonDto,
  ) {
    return this.seasonsService.create(clubId, teamId, dto);
  }

  @RequirePermission('season', 'READ')
  @Get()
  findAll(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Query() query: FindSeasonsQueryDto,
  ) {
    return this.seasonsService.findAllByTeam(clubId, teamId, query);
  }

  @RequirePermission('season', 'READ')
  @Get(':id')
  findOne(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.seasonsService.findOne(clubId, teamId, id);
  }

  // Étape 2 du wizard (docs/modules/saisons-championnats.md) : roster actif
  // actuel de l'équipe, candidat à la reconduction.
  @RequirePermission('season', 'READ')
  @Get(':id/roster-import-preview')
  previewRosterImport(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.seasonRosterImportService.previewRoster(clubId, teamId, id);
  }

  @RequirePermission('season', 'UPDATE')
  @Post(':id/roster-import')
  importRoster(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ImportSeasonRosterDto,
  ) {
    return this.seasonRosterImportService.importRoster(
      clubId,
      teamId,
      id,
      dto.retainedPlayerIds,
    );
  }

  @RequirePermission('season', 'UPDATE')
  @Patch(':id')
  update(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSeasonDto,
  ) {
    return this.seasonsService.update(clubId, teamId, id, dto);
  }

  @RequirePermission('season', 'DELETE')
  @Delete(':id')
  remove(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.seasonsService.remove(clubId, teamId, id);
  }
}
