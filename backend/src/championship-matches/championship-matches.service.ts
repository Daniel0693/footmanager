import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { assertTeamInClub } from '../common/team-club-membership';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { CreateChampionshipMatchDto } from './dto/create-championship-match.dto';
import { FindChampionshipMatchesQueryDto } from './dto/find-championship-matches-query.dto';
import { UpdateChampionshipMatchDto } from './dto/update-championship-match.dto';

const PARTICIPANT_SELECT = {
  id: true,
  internalTeam: { select: { id: true, name: true } },
  externalTeam: { select: { id: true, name: true } },
} as const;

const MATCH_INCLUDE = {
  homeParticipant: { select: PARTICIPANT_SELECT },
  awayParticipant: { select: PARTICIPANT_SELECT },
} as const;

/**
 * CRUD des rencontres d'un championnat (docs/schema/championnats.md —
 * ChampionshipMatch), scopé ÉQUIPE via `clubs/:clubId/teams/:teamId/
 * championships/:championshipId/matches` (même route directe que
 * ChampionshipsService/ChampionshipParticipantsService).
 *
 * `matchId` (lien vers `Match`) est totalement absent des DTO — jamais
 * modifiable directement via cette route. Le passage au statut FINISHED
 * exige `scoreHome`/`scoreAway` non-null (source de vérité du score pour le
 * classement, B12) — vérifié ici, pas en décorateur puisque la règle dépend
 * à la fois du DTO et de l'état déjà persisté.
 *
 * **Liaison Calendrier (Phase 4, A3)** : `create`/`createBulk` créent
 * automatiquement l'`Event`+`Match` liés (`createLinkedMatchIfOwnTeamInvolved`),
 * dans la même transaction, uniquement si l'une de nos équipes (
 * `Championship.teamId`) participe à la rencontre — une rencontre entre
 * deux adversaires n'a jamais de fiche match pour nous
 * (docs/modules/matchs.md). `update` répercute un changement de
 * `scheduledAt` sur l'`Event.startAt` lié s'il existe ; `remove` supprime le
 * `Match`+`Event` lié avant la rencontre elle-même, pour ne jamais laisser
 * de fiche match orpheline. Le statut (`ChampionshipMatchStatus` ↔
 * `LiveMatchStatus`) n'est volontairement PAS synchronisé — la clôture d'un
 * match live (Partie C) reste l'unique flux qui fait passer un `Match` à
 * `FINISHED`.
 */
@Injectable()
export class ChampionshipMatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async create(
    clubId: number,
    teamId: number,
    championshipId: number,
    dto: CreateChampionshipMatchDto,
  ) {
    const championship = await this.findChampionshipOrThrow(
      clubId,
      teamId,
      championshipId,
    );

    if (dto.homeParticipantId === dto.awayParticipantId) {
      throw new AppException(
        'CHAMPIONSHIP_MATCHES.SAME_PARTICIPANT',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.assertParticipantInChampionship(
      championshipId,
      dto.homeParticipantId,
    );
    await this.assertParticipantInChampionship(
      championshipId,
      dto.awayParticipantId,
    );

    return this.prisma.$transaction(async (tx) => {
      const championshipMatch = await tx.championshipMatch.create({
        data: {
          championshipId,
          homeParticipantId: dto.homeParticipantId,
          awayParticipantId: dto.awayParticipantId,
          scheduledAt: dto.scheduledAt,
          round: dto.round,
          numberOfPeriods: dto.numberOfPeriods,
          periodDurationMinutes: dto.periodDurationMinutes,
        },
        include: MATCH_INCLUDE,
      });
      await this.createLinkedMatchIfOwnTeamInvolved(
        tx,
        championship.teamId,
        championshipMatch,
      );
      return championshipMatch;
    });
  }

  // Ajout en masse (docs/roadmap.md B16) : mêmes règles de validation que
  // `create` (participants distincts, appartenance au championnat),
  // appliquées à chaque ligne AVANT toute écriture — puis création en une
  // seule transaction, tout ou rien (pas de lot partiellement créé si une
  // ligne est invalide, plus simple à comprendre pour l'utilisateur qu'un
  // résultat mixte succès/échec par ligne). Transaction interactive
  // (callback), pas le style tableau d'opérations utilisé avant A3 : chaque
  // création doit pouvoir déclencher sa propre liaison Match/Event
  // conditionnelle juste après.
  async createBulk(
    clubId: number,
    teamId: number,
    championshipId: number,
    dtos: CreateChampionshipMatchDto[],
  ) {
    const championship = await this.findChampionshipOrThrow(
      clubId,
      teamId,
      championshipId,
    );

    for (const dto of dtos) {
      if (dto.homeParticipantId === dto.awayParticipantId) {
        throw new AppException(
          'CHAMPIONSHIP_MATCHES.SAME_PARTICIPANT',
          HttpStatus.BAD_REQUEST,
        );
      }
      await this.assertParticipantInChampionship(
        championshipId,
        dto.homeParticipantId,
      );
      await this.assertParticipantInChampionship(
        championshipId,
        dto.awayParticipantId,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const championshipMatches = [];
      for (const dto of dtos) {
        const championshipMatch = await tx.championshipMatch.create({
          data: {
            championshipId,
            homeParticipantId: dto.homeParticipantId,
            awayParticipantId: dto.awayParticipantId,
            scheduledAt: dto.scheduledAt,
            round: dto.round,
            numberOfPeriods: dto.numberOfPeriods,
            periodDurationMinutes: dto.periodDurationMinutes,
          },
          include: MATCH_INCLUDE,
        });
        await this.createLinkedMatchIfOwnTeamInvolved(
          tx,
          championship.teamId,
          championshipMatch,
        );
        championshipMatches.push(championshipMatch);
      }
      return championshipMatches;
    });
  }

  async findAllByChampionship(
    clubId: number,
    teamId: number,
    championshipId: number,
    memberId: number,
    query: FindChampionshipMatchesQueryDto = {},
  ) {
    await this.findChampionshipOrThrow(clubId, teamId, championshipId);

    const [data, canManage] = await Promise.all([
      this.prisma.championshipMatch.findMany({
        where: { championshipId, status: query.status },
        include: MATCH_INCLUDE,
        orderBy: [{ round: 'asc' }, { scheduledAt: 'asc' }],
      }),
      this.canManage(clubId, teamId, memberId),
    ]);
    return { data, canManage };
  }

  async update(
    clubId: number,
    teamId: number,
    championshipId: number,
    id: number,
    dto: UpdateChampionshipMatchDto,
  ) {
    const match = await this.findMatchOrThrow(
      clubId,
      teamId,
      championshipId,
      id,
    );

    const resultingStatus = dto.status ?? match.status;
    const resultingScoreHome = dto.scoreHome ?? match.scoreHome;
    const resultingScoreAway = dto.scoreAway ?? match.scoreAway;
    if (
      resultingStatus === 'FINISHED' &&
      (resultingScoreHome === null || resultingScoreAway === null)
    ) {
      throw new AppException(
        'CHAMPIONSHIP_MATCHES.FINISHED_REQUIRES_SCORE',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.championshipMatch.update({
        where: { id },
        data: {
          scheduledAt: dto.scheduledAt,
          scoreHome: dto.scoreHome,
          scoreAway: dto.scoreAway,
          status: dto.status,
          round: dto.round,
          numberOfPeriods: dto.numberOfPeriods,
          periodDurationMinutes: dto.periodDurationMinutes,
        },
        include: MATCH_INCLUDE,
      });

      // Répercute un changement de date sur l'Event lié, s'il existe (A3) —
      // ne touche jamais le statut (voir docblock de la classe).
      if (dto.scheduledAt) {
        const linkedMatch = await tx.match.findUnique({
          where: { championshipMatchId: id },
          select: { eventId: true },
        });
        if (linkedMatch) {
          await tx.event.update({
            where: { id: linkedMatch.eventId },
            data: { startAt: dto.scheduledAt },
          });
        }
      }

      return updated;
    });
  }

  async remove(
    clubId: number,
    teamId: number,
    championshipId: number,
    id: number,
  ) {
    await this.findMatchOrThrow(clubId, teamId, championshipId, id);

    await this.prisma.$transaction(async (tx) => {
      // Supprime la fiche match/l'entrée calendrier liée AVANT la rencontre
      // elle-même (A3) — sans quoi Match.championshipMatchId passerait
      // silencieusement à NULL (ON DELETE SET NULL) et laisserait une fiche
      // match CHAMPIONNAT orpheline, sans source de vérité.
      const linkedMatch = await tx.match.findUnique({
        where: { championshipMatchId: id },
        select: { id: true, eventId: true },
      });
      if (linkedMatch) {
        await tx.match.delete({ where: { id: linkedMatch.id } });
        await tx.event.delete({ where: { id: linkedMatch.eventId } });
      }
      await tx.championshipMatch.delete({ where: { id } });
    });
  }

  // Crée l'Event+Match lié à un ChampionshipMatch fraîchement créé (A3,
  // docs/modules/matchs.md), uniquement si l'une des deux équipes
  // participantes EST l'équipe propriétaire du championnat — jamais pour
  // une rencontre entre deux adversaires (`internalTeamId` est de toute
  // façon restreint à l'équipe propriétaire, limite MVP B8, mais la
  // comparaison explicite reste plus sûre qu'une simple présence de
  // internalTeamId). `title` = nom de l'adversaire uniquement (pas de texte
  // en dur type "vs"/"Match contre" — le back ne compose jamais de texte
  // traduit, voir docs/architecture.md §3) ; l'affichage calendrier (A5)
  // compose un libellé complet côté frontend via i18n à partir du matchType.
  private async createLinkedMatchIfOwnTeamInvolved(
    tx: Prisma.TransactionClient,
    ownTeamId: number,
    championshipMatch: {
      id: number;
      homeParticipantId: number;
      awayParticipantId: number;
      scheduledAt: Date;
      numberOfPeriods: number | null;
      periodDurationMinutes: number | null;
    },
  ) {
    const [homeParticipant, awayParticipant] = await Promise.all([
      tx.championshipParticipant.findUniqueOrThrow({
        where: { id: championshipMatch.homeParticipantId },
        include: { internalTeam: true, externalTeam: true },
      }),
      tx.championshipParticipant.findUniqueOrThrow({
        where: { id: championshipMatch.awayParticipantId },
        include: { internalTeam: true, externalTeam: true },
      }),
    ]);

    let homeOrAway: 'HOME' | 'AWAY';
    let opponentName: string;
    if (homeParticipant.internalTeamId === ownTeamId) {
      homeOrAway = 'HOME';
      opponentName =
        awayParticipant.externalTeam?.name ??
        awayParticipant.internalTeam?.name ??
        '';
    } else if (awayParticipant.internalTeamId === ownTeamId) {
      homeOrAway = 'AWAY';
      opponentName =
        homeParticipant.externalTeam?.name ??
        homeParticipant.internalTeam?.name ??
        '';
    } else {
      // Rencontre entre deux adversaires — pas notre équipe, pas de fiche
      // match/entrée calendrier pour nous.
      return;
    }

    const event = await tx.event.create({
      data: {
        teamId: ownTeamId,
        type: 'MATCH',
        title: opponentName,
        startAt: championshipMatch.scheduledAt,
      },
    });

    await tx.match.create({
      data: {
        eventId: event.id,
        championshipMatchId: championshipMatch.id,
        matchType: 'CHAMPIONNAT',
        homeOrAway,
        numberOfPeriods: championshipMatch.numberOfPeriods,
        periodDurationMinutes: championshipMatch.periodDurationMinutes,
      },
    });
  }

  private async findChampionshipOrThrow(
    clubId: number,
    teamId: number,
    championshipId: number,
  ) {
    await assertTeamInClub(
      this.prisma,
      clubId,
      teamId,
      'CHAMPIONSHIP_MATCHES.TEAM_NOT_IN_CLUB',
    );
    const championship = await this.prisma.championship.findFirst({
      where: { id: championshipId, teamId },
    });
    if (!championship) {
      throw new AppException(
        'CHAMPIONSHIP_MATCHES.CHAMPIONSHIP_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return championship;
  }

  private async assertParticipantInChampionship(
    championshipId: number,
    participantId: number,
  ) {
    const participant = await this.prisma.championshipParticipant.findFirst({
      where: { id: participantId, championshipId },
    });
    if (!participant) {
      throw new AppException(
        'CHAMPIONSHIP_MATCHES.PARTICIPANT_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  private async findMatchOrThrow(
    clubId: number,
    teamId: number,
    championshipId: number,
    id: number,
  ) {
    await this.findChampionshipOrThrow(clubId, teamId, championshipId);
    const match = await this.prisma.championshipMatch.findFirst({
      where: { id, championshipId },
    });
    if (!match) {
      throw new AppException(
        'CHAMPIONSHIP_MATCHES.NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return match;
  }

  // `canManage` reflète la capacité d'écriture réelle (planifier une
  // rencontre / saisir un résultat) — jamais déduit d'un rôle côté client
  // (règle CLAUDE.md). Player n'a que `championship_match READ` scope TEAM.
  private async canManage(clubId: number, teamId: number, memberId: number) {
    const scope = await this.permissionsService.can(
      memberId,
      'CREATE',
      'championship_match',
      { clubId, teamId },
    );
    return !!scope;
  }
}
