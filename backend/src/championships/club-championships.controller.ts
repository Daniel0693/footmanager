import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Member, PermissionScope } from '@prisma/client';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { CurrentPermissionScope } from '../auth/decorators/current-permission-scope.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ChampionshipsService } from './championships.service';

// Vue "championnats du club, toutes équipes confondues" (docs/roadmap.md
// B20, retour utilisateur) — consommée par la liste des championnats pour
// un AdminClub/SuperAdmin/Proprietaire (colonne Équipe, sélecteur de club
// pour SuperAdmin/Proprietaire). `?teamId=` transmis pour que
// `ChampionshipsService.findAllByClub` puisse borner la vue à une seule
// équipe si le scope résolu est TEAM (Coach) — voir le commentaire du
// service, même garde-fou que `SeasonChampionshipsController`.
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/championships')
export class ClubChampionshipsController {
  constructor(private readonly championshipsService: ChampionshipsService) {}

  @RequirePermission('championship', 'READ')
  @Get()
  findAllByClub(
    @Param('clubId', ParseIntPipe) clubId: number,
    @CurrentMember() member: Member,
    @CurrentPermissionScope() scope: PermissionScope,
    @Query('teamId') teamId?: string,
  ) {
    return this.championshipsService.findAllByClub(clubId, member.id, {
      scope,
      teamId: teamId !== undefined ? Number(teamId) : undefined,
    });
  }
}
