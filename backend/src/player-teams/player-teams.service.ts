import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlayerTeamDto } from './dto/create-player-team.dto';
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
    await this.assertTeamInClub(clubId, teamId);
    await this.assertPlayerInClub(clubId, dto.playerId);

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
        secondaryPosition: dto.secondaryPosition,
        joinDate: dto.joinDate,
      },
    });
  }

  async findAllByTeam(clubId: number, teamId: number) {
    await this.assertTeamInClub(clubId, teamId);

    return this.prisma.playerTeam.findMany({
      where: { teamId, leaveDate: null },
      orderBy: { jerseyNumber: 'asc' },
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
        secondaryPosition: dto.secondaryPosition,
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

  private async assertTeamInClub(clubId: number, teamId: number) {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, clubId },
    });
    if (!team) {
      throw new AppException(
        'PLAYER_TEAMS.TEAM_NOT_IN_CLUB',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async assertPlayerInClub(clubId: number, playerId: number) {
    const player = await this.prisma.playerProfile.findFirst({
      where: { id: playerId, member: { clubId } },
    });
    if (!player) {
      throw new AppException(
        'PLAYER_TEAMS.PLAYER_NOT_IN_CLUB',
        HttpStatus.BAD_REQUEST,
      );
    }
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
