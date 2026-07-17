import { HttpStatus, Injectable } from '@nestjs/common';
import type { PermissionScope, Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { assertParentChildLink } from '../common/parent-child-membership';
import { assertPlayerInTeam } from '../common/player-team-membership';
import { assertTeamInClub } from '../common/team-club-membership';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { UpdateMatchAttendanceDto } from './dto/update-match-attendance.dto';

const PLAYER_INCLUDE = {
  player: {
    select: {
      id: true,
      member: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} as const;

export interface MatchAttendanceRequestContext {
  memberId: number;
  scope: PermissionScope;
}

/**
 * Convocations et présences à un match (docs/schema/evenements.md —
 * MatchAttendance), scopées ÉQUIPE via `clubs/:clubId/teams/:teamId/
 * matches/:matchId/attendances`. `PermissionsGuard` ne vérifie que "ce
 * membre a-t-il un scope quelconque sur match_attendance/ACTION dans ce
 * club/équipe ?" — jamais que la ressource ciblée est bien celle de
 * l'appelant (scope OWN) ou de son enfant (scope PARENT), même pattern que
 * PlayerAbsencesService.
 */
@Injectable()
export class MatchAttendancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  // Convocation en masse — idempotente : un joueur déjà convoqué n'est
  // jamais dupliqué ni réinitialisé (permet au Coach de revenir ajouter des
  // joueurs plus tard sans perdre les réponses déjà données).
  async createBulk(
    clubId: number,
    teamId: number,
    matchId: number,
    playerIds: number[],
  ) {
    await this.findMatchOrThrow(clubId, teamId, matchId);
    for (const playerId of playerIds) {
      await assertPlayerInTeam(this.prisma, playerId, teamId);
    }

    const existing = await this.prisma.matchAttendance.findMany({
      where: { matchId, playerId: { in: playerIds } },
      select: { playerId: true },
    });
    const alreadyConvened = new Set(existing.map((e) => e.playerId));
    const toCreate = playerIds.filter((id) => !alreadyConvened.has(id));
    if (toCreate.length > 0) {
      await this.prisma.matchAttendance.createMany({
        data: toCreate.map((playerId) => ({ matchId, playerId })),
      });
    }

    return this.prisma.matchAttendance.findMany({
      where: { matchId },
      include: PLAYER_INCLUDE,
      orderBy: { id: 'asc' },
    });
  }

  async findAllByMatch(
    clubId: number,
    teamId: number,
    matchId: number,
    requester: MatchAttendanceRequestContext,
  ) {
    await this.findMatchOrThrow(clubId, teamId, matchId);

    const where: Prisma.MatchAttendanceWhereInput = { matchId };
    if (requester.scope === 'OWN') {
      where.playerId = await this.resolveOwnPlayerId(requester.memberId);
    } else if (requester.scope === 'PARENT') {
      where.playerId = {
        in: await this.resolveChildPlayerIds(requester.memberId),
      };
    }

    const [data, canManage] = await Promise.all([
      this.prisma.matchAttendance.findMany({
        where,
        include: PLAYER_INCLUDE,
        orderBy: { id: 'asc' },
      }),
      this.canManage(clubId, teamId, requester.memberId),
    ]);
    return { data, canManage };
  }

  async update(
    clubId: number,
    teamId: number,
    matchId: number,
    id: number,
    dto: UpdateMatchAttendanceDto,
    requester: MatchAttendanceRequestContext,
  ) {
    const attendance = await this.findAttendanceOrThrow(
      clubId,
      teamId,
      matchId,
      id,
    );

    if (
      requester.scope === 'TEAM' ||
      requester.scope === 'CLUB' ||
      requester.scope === 'ALL'
    ) {
      return this.prisma.matchAttendance.update({
        where: { id },
        data: {
          convocationStatus: dto.convocationStatus,
          attendanceStatus: dto.attendanceStatus,
        },
        include: PLAYER_INCLUDE,
      });
    }

    // Scope OWN/PARENT : réponse à sa propre convocation (ou celle de son
    // enfant) uniquement — jamais attendanceStatus (réservé au Coach), jamais
    // un retour à PENDING.
    if (dto.attendanceStatus !== undefined) {
      throw new AppException(
        'MATCH_ATTENDANCES.ATTENDANCE_STATUS_NOT_EDITABLE',
        HttpStatus.FORBIDDEN,
      );
    }
    if (dto.convocationStatus === 'PENDING') {
      throw new AppException(
        'MATCH_ATTENDANCES.INVALID_RESPONSE',
        HttpStatus.BAD_REQUEST,
      );
    }

    const player = await this.prisma.playerProfile.findUniqueOrThrow({
      where: { id: attendance.playerId },
    });
    if (requester.scope === 'OWN' && player.memberId !== requester.memberId) {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    if (
      requester.scope === 'PARENT' &&
      player.memberId !== requester.memberId
    ) {
      await assertParentChildLink(
        this.prisma,
        requester.memberId,
        player.memberId,
        'MATCH_ATTENDANCES.NOT_FOUND',
      );
    }

    return this.prisma.matchAttendance.update({
      where: { id },
      data: { convocationStatus: dto.convocationStatus },
      include: PLAYER_INCLUDE,
    });
  }

  async remove(clubId: number, teamId: number, matchId: number, id: number) {
    await this.findAttendanceOrThrow(clubId, teamId, matchId, id);
    await this.prisma.matchAttendance.delete({ where: { id } });
  }

  private async resolveOwnPlayerId(memberId: number): Promise<number> {
    const player = await this.prisma.playerProfile.findFirst({
      where: { memberId },
      select: { id: true },
    });
    // -1 : aucun profil joueur pour ce membre — where.playerId ne matchera
    // jamais rien, plutôt qu'une erreur (une liste vide est le comportement
    // attendu, pas un cas d'erreur).
    return player?.id ?? -1;
  }

  private async resolveChildPlayerIds(
    parentMemberId: number,
  ): Promise<number[]> {
    const links = await this.prisma.parentChild.findMany({
      where: { parentMemberId },
      select: { childMemberId: true },
    });
    const children = await this.prisma.playerProfile.findMany({
      where: { memberId: { in: links.map((l) => l.childMemberId) } },
      select: { id: true },
    });
    return children.map((c) => c.id);
  }

  private async findMatchOrThrow(
    clubId: number,
    teamId: number,
    matchId: number,
  ) {
    await assertTeamInClub(
      this.prisma,
      clubId,
      teamId,
      'MATCH_ATTENDANCES.TEAM_NOT_IN_CLUB',
    );
    const match = await this.prisma.match.findFirst({
      where: { id: matchId, event: { teamId } },
    });
    if (!match) {
      throw new AppException(
        'MATCH_ATTENDANCES.MATCH_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return match;
  }

  // `canManage` reflète la capacité de convoquer (bouton "Convoquer des
  // joueurs") — jamais déduit d'un rôle côté client (règle CLAUDE.md).
  // AdminClub n'a que READ sur match_attendance (docs/modules/matchs.md
  // §Droits par rôle), donc toujours canManage=false pour lui, contrairement
  // à `match` où il a le CRUD complet — les deux ne coïncident jamais.
  private async canManage(clubId: number, teamId: number, memberId: number) {
    const scope = await this.permissionsService.can(
      memberId,
      'CREATE',
      'match_attendance',
      { clubId, teamId },
    );
    return !!scope;
  }

  private async findAttendanceOrThrow(
    clubId: number,
    teamId: number,
    matchId: number,
    id: number,
  ) {
    await this.findMatchOrThrow(clubId, teamId, matchId);
    const attendance = await this.prisma.matchAttendance.findFirst({
      where: { id, matchId },
    });
    if (!attendance) {
      throw new AppException(
        'MATCH_ATTENDANCES.NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return attendance;
  }
}
