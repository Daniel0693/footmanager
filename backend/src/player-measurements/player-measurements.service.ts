import { HttpStatus, Injectable } from '@nestjs/common';
import type { PermissionScope } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { assertParentChildLink } from '../common/parent-child-membership';
import { assertPlayerInClub } from '../common/player-club-membership';
import { assertPlayerInTeam } from '../common/player-team-membership';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlayerMeasurementDto } from './dto/create-player-measurement.dto';
import { FindPlayerMeasurementsQueryDto } from './dto/find-player-measurements-query.dto';

export interface PlayerMeasurementRequestContext {
  memberId: number;
  scope: PermissionScope;
  // Résolu depuis la query `?teamId=` (voir controller) — requis uniquement
  // quand `scope === 'TEAM'` (voir assertPlayerInTeam).
  teamId?: number;
}

/**
 * Historique des mesures physiques (docs/schema/joueurs.md) : une ligne par
 * mesure, jamais de mise à jour en place — pas de méthode update(), corriger
 * une saisie erronée passe par remove() + create().
 *
 * PermissionsGuard ne vérifie que "ce membre a-t-il un scope quelconque sur
 * player_measurement/ACTION dans ce club ?" — pas que le joueur ciblé par
 * l'URL est bien lui-même. Pour le scope OWN (Player), c'est ce service qui
 * compare le `memberId` du joueur visé à celui de l'appelant ; pour le scope
 * TEAM (Coach), il vérifie que le joueur appartient bien à l'équipe transmise
 * en query (même pattern que PlayersService.findOne, docs/modules/auth-roles.md).
 */
@Injectable()
export class PlayerMeasurementsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    clubId: number,
    playerId: number,
    dto: CreatePlayerMeasurementDto,
    requester: PlayerMeasurementRequestContext,
  ) {
    await assertPlayerInClub(
      this.prisma,
      clubId,
      playerId,
      'PLAYER_MEASUREMENTS.PLAYER_NOT_IN_CLUB',
    );
    if (requester.scope === 'TEAM') {
      await assertPlayerInTeam(this.prisma, playerId, requester.teamId);
    }

    return this.prisma.playerMeasurement.create({
      data: {
        playerId,
        type: dto.type,
        value: dto.value,
        date: dto.date,
      },
    });
  }

  async findAllByPlayer(
    clubId: number,
    playerId: number,
    requester: PlayerMeasurementRequestContext,
    query: FindPlayerMeasurementsQueryDto = {},
  ) {
    const player = await assertPlayerInClub(
      this.prisma,
      clubId,
      playerId,
      'PLAYER_MEASUREMENTS.PLAYER_NOT_IN_CLUB',
    );
    if (requester.scope === 'OWN' && player.memberId !== requester.memberId) {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    if (requester.scope === 'TEAM') {
      await assertPlayerInTeam(this.prisma, playerId, requester.teamId);
    }
    if (
      requester.scope === 'PARENT' &&
      player.memberId !== requester.memberId
    ) {
      await assertParentChildLink(
        this.prisma,
        requester.memberId,
        player.memberId,
        'PLAYER_MEASUREMENTS.PLAYER_NOT_IN_CLUB',
      );
    }

    return this.prisma.playerMeasurement.findMany({
      where: {
        playerId,
        type: query.type,
        date: { gte: query.dateFrom, lte: query.dateTo },
      },
      orderBy: { [query.sortBy ?? 'date']: query.sortOrder ?? 'asc' },
    });
  }

  async remove(
    clubId: number,
    playerId: number,
    id: number,
    requester: PlayerMeasurementRequestContext,
  ) {
    await assertPlayerInClub(
      this.prisma,
      clubId,
      playerId,
      'PLAYER_MEASUREMENTS.PLAYER_NOT_IN_CLUB',
    );
    if (requester.scope === 'TEAM') {
      await assertPlayerInTeam(this.prisma, playerId, requester.teamId);
    }

    const measurement = await this.prisma.playerMeasurement.findFirst({
      where: { id, playerId },
    });
    if (!measurement) {
      throw new AppException(
        'PLAYER_MEASUREMENTS.NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.prisma.playerMeasurement.delete({ where: { id } });
  }
}
