import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import { assertTeamInClub } from '../common/team-club-membership';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { CreateChampionshipParticipantDto } from './dto/create-championship-participant.dto';

const PARTICIPANT_INCLUDE = {
  internalTeam: { select: { id: true, name: true } },
  externalTeam: { select: { id: true, name: true } },
} as const;

/**
 * CRUD des participants à un championnat (docs/schema/championnats.md —
 * ChampionshipParticipant), scopé ÉQUIPE via `clubs/:clubId/teams/:teamId/
 * championships/:championshipId/participants` (même route directe que
 * ChampionshipsService, pas de contournement `?teamId=`).
 *
 * **Limite MVP documentée** (docs/modules/saisons-championnats.md) :
 * `internalTeamId` restreint à l'équipe propriétaire du championnat
 * (`teamId` de l'URL) — un championnat créé par l'équipe U15 ne peut donc
 * jamais compter une AUTRE équipe interne du club (ex. U15 B) comme
 * participante, seulement des `ExternalTeam`. Simplifie le MVP : pas de
 * gestion d'un "affrontement intra-club" dans le classement.
 */
@Injectable()
export class ChampionshipParticipantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async create(
    clubId: number,
    teamId: number,
    championshipId: number,
    dto: CreateChampionshipParticipantDto,
  ) {
    await this.findChampionshipOrThrow(clubId, teamId, championshipId);

    const hasInternal = dto.internalTeamId !== undefined;
    const hasExternal = dto.externalTeamId !== undefined;
    if (hasInternal === hasExternal) {
      throw new AppException(
        'CHAMPIONSHIP_PARTICIPANTS.EXACTLY_ONE_TEAM_REQUIRED',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (hasInternal && dto.internalTeamId !== teamId) {
      throw new AppException(
        'CHAMPIONSHIP_PARTICIPANTS.INTERNAL_TEAM_MUST_BE_OWNER',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (hasExternal) {
      const externalTeam = await this.prisma.externalTeam.findFirst({
        where: { id: dto.externalTeamId, clubId },
      });
      if (!externalTeam) {
        throw new AppException(
          'CHAMPIONSHIP_PARTICIPANTS.EXTERNAL_TEAM_NOT_FOUND',
          HttpStatus.NOT_FOUND,
        );
      }
    }

    const existing = await this.prisma.championshipParticipant.findFirst({
      where: {
        championshipId,
        internalTeamId: dto.internalTeamId,
        externalTeamId: dto.externalTeamId,
      },
    });
    if (existing) {
      throw new AppException(
        'CHAMPIONSHIP_PARTICIPANTS.ALREADY_PARTICIPANT',
        HttpStatus.CONFLICT,
      );
    }

    return this.prisma.championshipParticipant.create({
      data: {
        championshipId,
        internalTeamId: dto.internalTeamId,
        externalTeamId: dto.externalTeamId,
      },
      include: PARTICIPANT_INCLUDE,
    });
  }

  async findAllByChampionship(
    clubId: number,
    teamId: number,
    championshipId: number,
    memberId: number,
  ) {
    await this.findChampionshipOrThrow(clubId, teamId, championshipId);

    const [data, canManage] = await Promise.all([
      this.prisma.championshipParticipant.findMany({
        where: { championshipId },
        include: PARTICIPANT_INCLUDE,
        orderBy: { id: 'asc' },
      }),
      this.canManage(clubId, teamId, memberId),
    ]);
    return { data, canManage };
  }

  async remove(
    clubId: number,
    teamId: number,
    championshipId: number,
    id: number,
  ) {
    await this.findChampionshipOrThrow(clubId, teamId, championshipId);
    const participant = await this.prisma.championshipParticipant.findFirst({
      where: { id, championshipId },
    });
    if (!participant) {
      throw new AppException(
        'CHAMPIONSHIP_PARTICIPANTS.NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.prisma.championshipParticipant.delete({ where: { id } });
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
      'CHAMPIONSHIP_PARTICIPANTS.TEAM_NOT_IN_CLUB',
    );
    const championship = await this.prisma.championship.findFirst({
      where: { id: championshipId, teamId },
    });
    if (!championship) {
      throw new AppException(
        'CHAMPIONSHIP_PARTICIPANTS.CHAMPIONSHIP_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return championship;
  }

  // `canManage` reflète la capacité d'écriture réelle (boutons Ajouter/
  // Retirer un participant) — jamais déduit d'un rôle côté client (règle
  // CLAUDE.md). Player n'a que `championship_participant READ` scope TEAM.
  private async canManage(clubId: number, teamId: number, memberId: number) {
    const scope = await this.permissionsService.can(
      memberId,
      'CREATE',
      'championship_participant',
      { clubId, teamId },
    );
    return !!scope;
  }
}
