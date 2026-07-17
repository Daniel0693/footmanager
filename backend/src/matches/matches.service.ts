import { HttpStatus, Injectable } from '@nestjs/common';
import type { HomeOrAway, LiveMatchStatus } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { assertTeamInClub } from '../common/team-club-membership';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { CreateMatchDto } from './dto/create-match.dto';
import { FindMatchesQueryDto } from './dto/find-matches-query.dto';
import { UpdateMatchDto } from './dto/update-match.dto';

const MATCH_INCLUDE = {
  event: true,
  opponentExternalTeam: { select: { id: true, name: true } },
} as const;

/**
 * CRUD des matchs de notre équipe (docs/schema/evenements.md — Match),
 * scopé équipe via `clubs/:clubId/teams/:teamId/matches` (même route
 * directe que EventsController/ChampionshipMatchesController).
 *
 * Ne couvre que la création DIRECTE depuis le Calendrier — réservée à
 * COUPE/AMICAL/TOURNOI (docs/modules/matchs.md §Cycle de vie). Un match
 * CHAMPIONNAT ne se crée jamais ici : il naît d'un ChampionshipMatch
 * (ChampionshipMatchesService, Partie A A3) qui crée l'Event+Match en
 * transaction. Cette route reste toutefois le point d'entrée générique pour
 * lire/modifier/supprimer N'IMPORTE QUEL matchType, championnat inclus.
 */
@Injectable()
export class MatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async create(clubId: number, teamId: number, dto: CreateMatchDto) {
    await assertTeamInClub(
      this.prisma,
      clubId,
      teamId,
      'MATCHES.TEAM_NOT_IN_CLUB',
    );

    if (dto.matchType === 'CHAMPIONNAT') {
      throw new AppException(
        'MATCHES.CHAMPIONNAT_NOT_DIRECT',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.matchType !== 'COUPE' && dto.cupRound) {
      throw new AppException(
        'MATCHES.CUP_ROUND_NOT_ALLOWED',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.assertExternalTeamInClub(clubId, dto.opponentExternalTeamId);

    return this.prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          teamId,
          type: 'MATCH',
          title: dto.title,
          startAt: dto.startAt,
          endAt: dto.endAt,
          location: dto.location,
          description: dto.description,
        },
      });

      return tx.match.create({
        data: {
          eventId: event.id,
          matchType: dto.matchType,
          opponentExternalTeamId: dto.opponentExternalTeamId,
          cupRound: dto.matchType === 'COUPE' ? dto.cupRound : undefined,
          homeOrAway: dto.homeOrAway,
          numberOfPeriods: dto.numberOfPeriods,
          periodDurationMinutes: dto.periodDurationMinutes,
          gameFormat: dto.gameFormat,
        },
        include: MATCH_INCLUDE,
      });
    });
  }

  async findAllByTeam(
    clubId: number,
    teamId: number,
    memberId: number,
    query: FindMatchesQueryDto = {},
  ) {
    await assertTeamInClub(
      this.prisma,
      clubId,
      teamId,
      'MATCHES.TEAM_NOT_IN_CLUB',
    );

    const [data, canManage] = await Promise.all([
      this.prisma.match.findMany({
        where: {
          event: { teamId },
          matchType: query.matchType,
          status: query.status,
        },
        include: MATCH_INCLUDE,
        orderBy: { event: { startAt: 'asc' } },
      }),
      this.canManage(clubId, teamId, memberId),
    ]);
    return { data, canManage };
  }

  async findOne(clubId: number, teamId: number, id: number, memberId: number) {
    const [match, canManage] = await Promise.all([
      this.findMatchOrThrow(clubId, teamId, id),
      this.canManage(clubId, teamId, memberId),
    ]);
    return { ...match, canManage };
  }

  async update(
    clubId: number,
    teamId: number,
    id: number,
    dto: UpdateMatchDto,
  ) {
    const match = await this.findMatchOrThrow(clubId, teamId, id);

    if (
      match.matchType === 'CHAMPIONNAT' &&
      (dto.opponentExternalTeamId !== undefined ||
        dto.cupRound !== undefined ||
        dto.homeOrAway !== undefined)
    ) {
      // Adversaire, phase de coupe et domicile/extérieur sont dérivés du
      // ChampionshipMatch pour un match CHAMPIONNAT — jamais modifiables ici,
      // pour ne jamais désynchroniser Match de sa source de vérité.
      throw new AppException(
        'MATCHES.OPPONENT_NOT_EDITABLE',
        HttpStatus.BAD_REQUEST,
      );
    }
    const resultingMatchType = match.matchType;
    if (resultingMatchType !== 'COUPE' && dto.cupRound) {
      throw new AppException(
        'MATCHES.CUP_ROUND_NOT_ALLOWED',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.opponentExternalTeamId !== undefined) {
      await this.assertExternalTeamInClub(clubId, dto.opponentExternalTeamId);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: match.eventId },
        data: {
          title: dto.title,
          startAt: dto.startAt,
          endAt: dto.endAt,
          location: dto.location,
          description: dto.description,
        },
      });

      return tx.match.update({
        where: { id },
        data: {
          opponentExternalTeamId: dto.opponentExternalTeamId,
          cupRound: dto.cupRound,
          homeOrAway: dto.homeOrAway,
          numberOfPeriods: dto.numberOfPeriods,
          periodDurationMinutes: dto.periodDurationMinutes,
          formation: dto.formation,
          gameFormat: dto.gameFormat,
        },
        include: MATCH_INCLUDE,
      });
    });
  }

  async remove(clubId: number, teamId: number, id: number) {
    const match = await this.findMatchOrThrow(clubId, teamId, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.match.delete({ where: { id } });
      await tx.event.delete({ where: { id: match.eventId } });
    });
  }

  // Clôture d'un match live (docs/modules/matchs.md §Clôture du match,
  // Phase 4, Partie C, C3) : passe Match.status à FINISHED et écrit le score
  // calculé depuis les MatchEvent GOAL/OWN_GOAL sur ChampionshipMatch (match
  // CHAMPIONNAT — seul flux qui le fait passer à FINISHED, voir docs/modules/
  // matchs.md §Création directe) ou sur Match lui-même (les 3 autres types).
  // PENALTY_SCORED/MISSED ne comptent jamais dans le score (réservés à une
  // séance de tirs au but, hors score de la rencontre — docs/schema/
  // evenements.md §MatchEvent).
  async close(clubId: number, teamId: number, id: number) {
    const match = await this.findMatchOrThrow(clubId, teamId, id);
    this.assertMatchActiveForClosure(match.status);

    const openPeriod = await this.prisma.matchPeriod.findFirst({
      where: { matchId: id, endedAt: null },
    });
    if (openPeriod) {
      throw new AppException('MATCHES.PERIOD_STILL_OPEN', HttpStatus.CONFLICT);
    }

    const { scoreHome, scoreAway } = await this.computeScore(
      id,
      match.homeOrAway,
    );

    return this.prisma.$transaction(async (tx) => {
      if (match.championshipMatchId) {
        await tx.championshipMatch.update({
          where: { id: match.championshipMatchId },
          data: { status: 'FINISHED', scoreHome, scoreAway },
        });
      }
      return tx.match.update({
        where: { id },
        data: {
          status: 'FINISHED',
          scoreHome: match.championshipMatchId ? undefined : scoreHome,
          scoreAway: match.championshipMatchId ? undefined : scoreAway,
        },
        include: MATCH_INCLUDE,
      });
    });
  }

  // Score = GOAL marqués par notre équipe (teamSide === homeOrAway) et par
  // l'adversaire (teamSide inverse), PLUS un OWN_GOAL de notre équipe qui
  // profite TOUJOURS à l'adversaire (csc) — OWN_GOAL est réservé à notre
  // équipe (docs/schema/evenements.md, MatchEventsService), pas de pendant
  // adverse documenté.
  private async computeScore(matchId: number, homeOrAway: HomeOrAway) {
    const goalEvents = await this.prisma.matchEvent.findMany({
      where: { matchId, type: { in: ['GOAL', 'OWN_GOAL'] } },
      select: { type: true, teamSide: true },
    });

    let ourGoals = 0;
    let opponentGoals = 0;
    for (const goalEvent of goalEvents) {
      const isOurs = goalEvent.teamSide === homeOrAway;
      if (goalEvent.type === 'OWN_GOAL') {
        opponentGoals += 1;
      } else if (isOurs) {
        ourGoals += 1;
      } else {
        opponentGoals += 1;
      }
    }

    return homeOrAway === 'HOME'
      ? { scoreHome: ourGoals, scoreAway: opponentGoals }
      : { scoreHome: opponentGoals, scoreAway: ourGoals };
  }

  private assertMatchActiveForClosure(status: LiveMatchStatus) {
    if (
      status === 'FINISHED' ||
      status === 'CANCELLED' ||
      status === 'POSTPONED'
    ) {
      throw new AppException(
        'MATCHES.MATCH_NOT_ACTIVE',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async assertExternalTeamInClub(
    clubId: number,
    externalTeamId: number,
  ) {
    const externalTeam = await this.prisma.externalTeam.findFirst({
      where: { id: externalTeamId, clubId },
    });
    if (!externalTeam) {
      throw new AppException(
        'MATCHES.EXTERNAL_TEAM_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  private async findMatchOrThrow(clubId: number, teamId: number, id: number) {
    const match = await this.prisma.match.findFirst({
      where: { id, event: { teamId, team: { clubId } } },
      include: MATCH_INCLUDE,
    });
    if (!match) {
      throw new AppException('MATCHES.NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return match;
  }

  // `canManage` reflète la capacité d'écriture réelle (bouton Nouveau match /
  // Modifier / Supprimer) — jamais déduit d'un rôle côté client (règle
  // CLAUDE.md). Player/Parent n'ont que `match READ`.
  private async canManage(clubId: number, teamId: number, memberId: number) {
    const scope = await this.permissionsService.can(
      memberId,
      'CREATE',
      'match',
      { clubId, teamId },
    );
    return !!scope;
  }
}
