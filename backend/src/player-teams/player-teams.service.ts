import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import { assertPlayerInClub } from '../common/player-club-membership';
import { assertTeamInClub } from '../common/team-club-membership';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlayerTeamDto } from './dto/create-player-team.dto';
import { FindPlayerTeamsQueryDto } from './dto/find-player-teams-query.dto';
import { UpdatePlayerTeamDto } from './dto/update-player-team.dto';

/**
 * Gère l'appartenance joueur ↔ équipe (docs/schema/joueurs.md — PlayerTeam).
 * Historisation par joinDate/leaveDate : "retirer" un joueur d'une équipe se
 * fait via update({ leaveDate }), jamais par suppression physique de la
 * ligne active — remove() reste réservé à la correction d'une erreur de
 * saisie (scope CLUB/ALL uniquement, voir seed.ts).
 */
@Injectable()
export class PlayerTeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(clubId: number, teamId: number, dto: CreatePlayerTeamDto) {
    await assertTeamInClub(
      this.prisma,
      clubId,
      teamId,
      'PLAYER_TEAMS.TEAM_NOT_IN_CLUB',
    );
    await assertPlayerInClub(
      this.prisma,
      clubId,
      dto.playerId,
      'PLAYER_TEAMS.PLAYER_NOT_IN_CLUB',
    );

    const activeAssignment = await this.prisma.playerTeam.findFirst({
      where: { playerId: dto.playerId, teamId, leaveDate: null },
    });
    if (activeAssignment) {
      throw new AppException(
        'PLAYER_TEAMS.ALREADY_ACTIVE',
        HttpStatus.CONFLICT,
      );
    }

    if (dto.jerseyNumber !== undefined) {
      await this.assertJerseyNumberAvailable(teamId, dto.jerseyNumber);
    }

    return this.prisma.playerTeam.create({
      data: {
        playerId: dto.playerId,
        teamId,
        jerseyNumber: dto.jerseyNumber,
        mainPosition: dto.mainPosition,
        secondaryPositions: dto.secondaryPositions,
        joinDate: dto.joinDate,
      },
    });
  }

  async findAllByTeam(
    clubId: number,
    teamId: number,
    query: FindPlayerTeamsQueryDto = {},
  ) {
    await assertTeamInClub(
      this.prisma,
      clubId,
      teamId,
      'PLAYER_TEAMS.TEAM_NOT_IN_CLUB',
    );

    // include player+member : la liste effectif (frontend) affiche le nom
    // du joueur, pas seulement son id.
    return this.prisma.playerTeam.findMany({
      where: {
        teamId,
        leaveDate: null,
        mainPosition: query.position ? { in: query.position } : undefined,
      },
      include: { player: { include: { member: true } } },
      orderBy: { jerseyNumber: 'asc' },
    });
  }

  // Action de premier ordre pour le bouton "Archiver" du tableau effectif
  // (docs/modules/effectif-joueurs.md) plutôt qu'un PATCH générique — délègue
  // entièrement à update() (même vérifications, même permission player_team
  // UPDATE), fixe juste leaveDate à aujourd'hui si aucune date n'est choisie.
  async archive(clubId: number, teamId: number, id: number, leaveDate?: Date) {
    return this.update(clubId, teamId, id, {
      leaveDate: leaveDate ?? new Date(),
    });
  }

  async update(
    clubId: number,
    teamId: number,
    id: number,
    dto: UpdatePlayerTeamDto,
  ) {
    const assignment = await this.findAssignmentOrThrow(clubId, teamId, id);

    if (
      dto.jerseyNumber !== undefined &&
      dto.jerseyNumber !== assignment.jerseyNumber
    ) {
      await this.assertJerseyNumberAvailable(teamId, dto.jerseyNumber, id);
    }

    return this.prisma.playerTeam.update({
      where: { id },
      data: {
        jerseyNumber: dto.jerseyNumber,
        mainPosition: dto.mainPosition,
        secondaryPositions: dto.secondaryPositions,
        joinDate: dto.joinDate,
        leaveDate: dto.leaveDate,
      },
    });
  }

  async remove(clubId: number, teamId: number, id: number) {
    await this.findAssignmentOrThrow(clubId, teamId, id);
    await this.prisma.playerTeam.delete({ where: { id } });
  }

  private async findAssignmentOrThrow(
    clubId: number,
    teamId: number,
    id: number,
  ) {
    const assignment = await this.prisma.playerTeam.findFirst({
      where: { id, teamId, team: { clubId } },
    });
    if (!assignment) {
      throw new AppException('PLAYER_TEAMS.NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return assignment;
  }

  /**
   * Pas de contrainte SQL sur (teamId, jerseyNumber) — voir
   * docs/schema/joueurs.md. Unicité vérifiée ici parmi les affectations
   * actives (leaveDate NULL) seulement, pour permettre la réattribution
   * d'un numéro d'une saison à l'autre.
   */
  private async assertJerseyNumberAvailable(
    teamId: number,
    jerseyNumber: number,
    excludeId?: number,
  ) {
    const conflict = await this.prisma.playerTeam.findFirst({
      where: {
        teamId,
        jerseyNumber,
        leaveDate: null,
        ...(excludeId !== undefined ? { id: { not: excludeId } } : {}),
      },
    });
    if (conflict) {
      throw new AppException(
        'PLAYER_TEAMS.JERSEY_NUMBER_TAKEN',
        HttpStatus.CONFLICT,
      );
    }
  }
}
