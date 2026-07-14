import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ChampionshipsService } from './championships.service';

// Vue "championnats d'une saison, toutes équipes du club confondues"
// (docs/roadmap.md B16) — consommée par la fiche de saison, contrairement à
// ChampionshipsController qui reste scopé à une équipe. Route séparée
// (plutôt qu'une méthode sur SeasonsController) : la permission vérifiée ici
// est `championship`, pas `season`, même si l'URL est nichée sous
// `seasons/:seasonId`.
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/seasons/:seasonId/championships')
export class SeasonChampionshipsController {
  constructor(private readonly championshipsService: ChampionshipsService) {}

  @RequirePermission('championship', 'READ')
  @Get()
  findAllBySeason(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('seasonId', ParseIntPipe) seasonId: number,
  ) {
    return this.championshipsService.findAllBySeason(clubId, seasonId);
  }
}
