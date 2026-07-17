import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import { assertPlayerInTeam } from '../common/player-team-membership';
import { assertTeamInClub } from '../common/team-club-membership';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { UpsertMatchLineupEntryDto } from './dto/upsert-match-lineups-bulk.dto';

const PLAYER_INCLUDE = {
  player: {
    select: {
      id: true,
      member: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} as const;

/**
 * Composition d'un match (docs/schema/evenements.md — MatchLineup), scopée
 * ÉQUIPE via `clubs/:clubId/teams/:teamId/matches/:matchId/lineups`. Pas de
 * scope OWN/PARENT (contrairement à MatchAttendance) : `docs/modules/
 * matchs.md` §Droits par rôle réserve la composition à Coach/AdminClub
 * (lecture seule)/SuperAdmin — Player n'a que `match_lineup READ TEAM` (voit
 * la composition entière, jamais de filtrage à sa propre ligne), Parent
 * aucun accès.
 */
@Injectable()
export class MatchLineupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  // Composition resoumise en une fois à chaque édition (pas un ajout
  // incrémental) : chaque ligne est upsert sur (matchId, playerId) — crée si
  // le joueur n'a pas encore de ligne, met à jour sinon (changement de
  // statut/poste/numéro/capitanat).
  async upsertBulk(
    clubId: number,
    teamId: number,
    matchId: number,
    entries: UpsertMatchLineupEntryDto[],
    memberId: number,
  ) {
    await this.findMatchOrThrow(clubId, teamId, matchId);
    for (const entry of entries) {
      await assertPlayerInTeam(this.prisma, entry.playerId, teamId);
    }

    // Au plus un capitaine par match, invariant maintenu ici (pas de
    // contrainte SQL, voir docs/schema/evenements.md §MatchLineup) — un seul
    // envoi ne peut jamais désigner deux capitaines à la fois, et désigner
    // un nouveau capitaine retire automatiquement le précédent.
    const captainEntries = entries.filter((entry) => entry.isCaptain === true);
    if (captainEntries.length > 1) {
      throw new AppException(
        'MATCH_LINEUPS.MULTIPLE_CAPTAINS_NOT_ALLOWED',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (captainEntries.length === 1) {
        const [captainEntry] = captainEntries;
        const existing = await tx.matchLineup.findUnique({
          where: {
            matchId_playerId: { matchId, playerId: captainEntry.playerId },
          },
        });
        const willBeStarter =
          captainEntry.pitchSpotId !== undefined
            ? captainEntry.pitchSpotId !== null
            : existing?.pitchSpotId != null;
        if (!willBeStarter) {
          throw new AppException(
            'MATCH_LINEUPS.CAPTAIN_MUST_BE_STARTER',
            HttpStatus.BAD_REQUEST,
          );
        }
        await tx.matchLineup.updateMany({
          where: {
            matchId,
            isCaptain: true,
            playerId: { not: captainEntry.playerId },
          },
          data: { isCaptain: false },
        });
      }

      for (const entry of entries) {
        await tx.matchLineup.upsert({
          where: {
            matchId_playerId: { matchId, playerId: entry.playerId },
          },
          create: {
            matchId,
            playerId: entry.playerId,
            lineupStatus: entry.lineupStatus,
            position: entry.position,
            pitchSpotId: entry.pitchSpotId,
            shirtNumber: entry.shirtNumber,
            isCaptain: entry.isCaptain,
          },
          update: {
            lineupStatus: entry.lineupStatus,
            position: entry.position,
            pitchSpotId: entry.pitchSpotId,
            shirtNumber: entry.shirtNumber,
            isCaptain: entry.isCaptain,
          },
        });
      }
    });

    return this.findAllByMatch(clubId, teamId, matchId, memberId);
  }

  async findAllByMatch(
    clubId: number,
    teamId: number,
    matchId: number,
    memberId: number,
  ) {
    await this.findMatchOrThrow(clubId, teamId, matchId);
    const [data, canManage] = await Promise.all([
      this.prisma.matchLineup.findMany({
        where: { matchId },
        include: PLAYER_INCLUDE,
        orderBy: { id: 'asc' },
      }),
      this.canManage(clubId, teamId, memberId),
    ]);
    return { data, canManage };
  }

  // `canManage` reflète la capacité de préparer la composition (bouton
  // "Modifier la composition") — jamais déduit d'un rôle côté client (règle
  // CLAUDE.md). AdminClub n'a que READ sur match_lineup (docs/modules/
  // matchs.md §Droits par rôle), donc toujours canManage=false pour lui,
  // contrairement à `match` où il a le CRUD complet.
  private async canManage(clubId: number, teamId: number, memberId: number) {
    const scope = await this.permissionsService.can(
      memberId,
      'CREATE',
      'match_lineup',
      { clubId, teamId },
    );
    return !!scope;
  }

  async remove(clubId: number, teamId: number, matchId: number, id: number) {
    await this.findLineupOrThrow(clubId, teamId, matchId, id);
    await this.prisma.matchLineup.delete({ where: { id } });
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
      'MATCH_LINEUPS.TEAM_NOT_IN_CLUB',
    );
    const match = await this.prisma.match.findFirst({
      where: { id: matchId, event: { teamId } },
    });
    if (!match) {
      throw new AppException(
        'MATCH_LINEUPS.MATCH_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return match;
  }

  private async findLineupOrThrow(
    clubId: number,
    teamId: number,
    matchId: number,
    id: number,
  ) {
    await this.findMatchOrThrow(clubId, teamId, matchId);
    const lineup = await this.prisma.matchLineup.findFirst({
      where: { id, matchId },
    });
    if (!lineup) {
      throw new AppException('MATCH_LINEUPS.NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return lineup;
  }
}
