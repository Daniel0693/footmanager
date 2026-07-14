import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreateExternalTeamDto } from './dto/create-external-team.dto';
import { UpdateExternalTeamDto } from './dto/update-external-team.dto';
import { ExternalTeamsService } from './external-teams.service';

// Ressource club-wide (docs/schema/championnats.md — ExternalTeam) : cette
// route ne porte pas de teamId. Un Coach (rôle scopé TEAM sur
// `external_team`, CRUD complet — décision 4 du plan Partie B) doit le
// transmettre en query (`?teamId=`) pour être autorisé — même pattern que
// `season`/`evaluation_config`, voir docs/modules/auth-roles.md
// §"Patterns découverts". Contrairement à `season`, le Coach connaît
// toujours son `teamId` en appelant cette route (gérée depuis l'écran de
// championnat de sa propre équipe).
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/external-teams')
export class ExternalTeamsController {
  constructor(private readonly externalTeamsService: ExternalTeamsService) {}

  @RequirePermission('external_team', 'CREATE')
  @Post()
  create(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Body() dto: CreateExternalTeamDto,
  ) {
    return this.externalTeamsService.create(clubId, dto);
  }

  @RequirePermission('external_team', 'READ')
  @Get()
  findAll(@Param('clubId', ParseIntPipe) clubId: number) {
    return this.externalTeamsService.findAllByClub(clubId);
  }

  @RequirePermission('external_team', 'READ')
  @Get(':id')
  findOne(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.externalTeamsService.findOne(clubId, id);
  }

  @RequirePermission('external_team', 'UPDATE')
  @Patch(':id')
  update(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExternalTeamDto,
  ) {
    return this.externalTeamsService.update(clubId, id, dto);
  }

  @RequirePermission('external_team', 'DELETE')
  @Delete(':id')
  remove(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.externalTeamsService.remove(clubId, id);
  }
}
