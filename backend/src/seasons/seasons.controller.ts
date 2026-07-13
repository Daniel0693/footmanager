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
import { ActivateSeasonDto } from './dto/activate-season.dto';
import { CreateSeasonDto } from './dto/create-season.dto';
import { FindSeasonsQueryDto } from './dto/find-seasons-query.dto';
import { ImportSeasonRosterDto } from './dto/import-season-roster.dto';
import { UpdateSeasonDto } from './dto/update-season.dto';
import { SeasonActivationService } from './season-activation.service';
import { SeasonRosterImportService } from './season-roster-import.service';
import { SeasonsService } from './seasons.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/teams/:teamId/seasons')
export class SeasonsController {
  constructor(
    private readonly seasonsService: SeasonsService,
    private readonly seasonRosterImportService: SeasonRosterImportService,
    private readonly seasonActivationService: SeasonActivationService,
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

  // Étape 4 du wizard (docs/modules/saisons-championnats.md) : résumé
  // reconduits/partants/arrivants + endDate pré-remplie de l'ancienne
  // saison, pour le formulaire de validation avant activation.
  @RequirePermission('season', 'READ')
  @Get(':id/activation-summary')
  getActivationSummary(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.seasonActivationService.getActivationSummary(
      clubId,
      teamId,
      id,
    );
  }

  @RequirePermission('season', 'UPDATE')
  @Post(':id/activate')
  activate(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActivateSeasonDto,
  ) {
    return this.seasonActivationService.activate(
      clubId,
      teamId,
      id,
      dto.oldSeasonEndDate,
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
