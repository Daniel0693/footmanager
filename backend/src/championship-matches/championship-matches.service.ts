import { HttpStatus, Injectable } from '@nestjs/common';
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
 * `matchId` (lien vers `Match`, Phase 4) est totalement absent des DTO —
 * jamais modifiable via cette route en Phase 3. Le passage au statut
 * FINISHED exige `scoreHome`/`scoreAway` non-null (source de vérité du
 * score pour le classement, B12) — vérifié ici, pas en décorateur puisque
 * la règle dépend à la fois du DTO et de l'état déjà persisté.
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
    await this.findChampionshipOrThrow(clubId, teamId, championshipId);

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

    return this.prisma.championshipMatch.create({
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
  }

  // Ajout en masse (docs/roadmap.md B16) : mêmes règles de validation que
  // `create` (participants distincts, appartenance au championnat),
  // appliquées à chaque ligne AVANT toute écriture — puis création en une
  // seule transaction, tout ou rien (pas de lot partiellement créé si une
  // ligne est invalide, plus simple à comprendre pour l'utilisateur qu'un
  // résultat mixte succès/échec par ligne).
  async createBulk(
    clubId: number,
    teamId: number,
    championshipId: number,
    dtos: CreateChampionshipMatchDto[],
  ) {
    await this.findChampionshipOrThrow(clubId, teamId, championshipId);

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

    return this.prisma.$transaction(
      dtos.map((dto) =>
        this.prisma.championshipMatch.create({
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
        }),
      ),
    );
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

    return this.prisma.championshipMatch.update({
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
  }

  async remove(
    clubId: number,
    teamId: number,
    championshipId: number,
    id: number,
  ) {
    await this.findMatchOrThrow(clubId, teamId, championshipId, id);
    await this.prisma.championshipMatch.delete({ where: { id } });
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
