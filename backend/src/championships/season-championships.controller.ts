import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { PermissionScope } from '@prisma/client';
import { CurrentPermissionScope } from '../auth/decorators/current-permission-scope.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ChampionshipsService } from './championships.service';

// Vue "championnats d'une saison, toutes équipes du club confondues"
// (docs/roadmap.md B16) — consommée par la fiche de saison, contrairement à
// ChampionshipsController qui reste scopé à une équipe. Route séparée
// (plutôt qu'une méthode sur SeasonsController) : la permission vérifiée ici
// est `championship`, pas `season`, même si l'URL est nichée sous
// `seasons/:seasonId`. `?teamId=` transmis pour que `ChampionshipsService
// .findAllBySeason` puisse borner la vue à une seule équipe si le scope
// résolu est TEAM (B20 — voir le commentaire du service).
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/seasons/:seasonId/championships')
export class SeasonChampionshipsController {
  constructor(private readonly championshipsService: ChampionshipsService) {}

  @RequirePermission('championship', 'READ')
  @Get()
  findAllBySeason(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('seasonId', ParseIntPipe) seasonId: number,
    @CurrentPermissionScope() scope: PermissionScope,
    @Query('teamId') teamId?: string,
  ) {
    return this.championshipsService.findAllBySeason(clubId, seasonId, {
      scope,
      teamId: teamId !== undefined ? Number(teamId) : undefined,
    });
  }
}
