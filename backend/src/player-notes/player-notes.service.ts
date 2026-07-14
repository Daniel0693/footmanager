import { HttpStatus, Injectable } from '@nestjs/common';
import type { PermissionScope } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { assertPlayerInClub } from '../common/player-club-membership';
import { assertPlayerInTeam } from '../common/player-team-membership';
import { resolveSeasonPeriod } from '../common/season-period';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlayerNoteDto } from './dto/create-player-note.dto';
import { FindPlayerNotesQueryDto } from './dto/find-player-notes-query.dto';
import { UpdatePlayerNoteDto } from './dto/update-player-note.dto';

export interface PlayerNoteRequestContext {
  memberId: number;
  scope: PermissionScope;
  // Résolu depuis la query `?teamId=` (voir controller) — requis uniquement
  // quand `scope === 'TEAM'` (voir assertPlayerInTeam).
  teamId?: number;
}

/**
 * Notes du staff sur un joueur (docs/schema/joueurs.md), modèle de
 * visibilité Privé/Semi-privé/Public (docs/decisions-ouvertes-et-rgpd.md).
 *
 * PermissionsGuard ne vérifie que "ce membre a-t-il un scope quelconque sur
 * player_note/ACTION dans ce club ?" — pas que le joueur ciblé par l'URL est
 * bien lui-même, ni qu'il appartient à l'équipe transmise en query. Pour le
 * scope OWN (Player), c'est ce service qui compare le `memberId` du joueur
 * visé à celui de l'appelant et filtre les notes PRIVE ; pour le scope TEAM
 * (Coach), il vérifie l'appartenance à l'équipe via `assertPlayerInTeam`
 * (docs/modules/auth-roles.md §Patterns découverts).
 */
@Injectable()
export class PlayerNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    clubId: number,
    playerId: number,
    authorMemberId: number,
    dto: CreatePlayerNoteDto,
    requester: PlayerNoteRequestContext,
  ) {
    await assertPlayerInClub(
      this.prisma,
      clubId,
      playerId,
      'PLAYER_NOTES.PLAYER_NOT_IN_CLUB',
    );
    if (requester.scope === 'TEAM') {
      await assertPlayerInTeam(this.prisma, playerId, requester.teamId);
    }

    return this.prisma.playerNote.create({
      data: {
        playerId,
        authorId: authorMemberId,
        visibility: dto.visibility,
        title: dto.title,
        content: dto.content,
      },
      include: { author: true },
    });
  }

  async findAllByPlayer(
    clubId: number,
    playerId: number,
    requester: PlayerNoteRequestContext,
    query: FindPlayerNotesQueryDto = {},
  ) {
    const player = await assertPlayerInClub(
      this.prisma,
      clubId,
      playerId,
      'PLAYER_NOTES.PLAYER_NOT_IN_CLUB',
    );
    if (requester.scope === 'OWN' && player.memberId !== requester.memberId) {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    if (requester.scope === 'TEAM') {
      await assertPlayerInTeam(this.prisma, playerId, requester.teamId);
    }

    // Filtrage rétroactif par saison (A12) : prioritaire sur dateFrom/dateTo
    // si transmis — mutuellement exclusifs au niveau UI (voir DTO).
    let dateFrom = query.dateFrom;
    let rawDateTo = query.dateTo;
    if (query.seasonId) {
      const period = await resolveSeasonPeriod(
        this.prisma,
        clubId,
        query.seasonId,
        'PLAYER_NOTES.SEASON_NOT_FOUND',
      );
      dateFrom = period.startDate;
      rawDateTo = period.endDate;
    }

    // `createdAt` est un horodatage complet (pas un `@db.Date` comme les
    // filtres de date des autres onglets) : une borne haute "2026-01-15"
    // désérialisée à minuit exclurait à tort les notes créées plus tard ce
    // même jour. On l'étend donc à la fin de journée pour que dateTo reste
    // inclusif du jour choisi.
    const dateTo = rawDateTo
      ? new Date(
          rawDateTo.getFullYear(),
          rawDateTo.getMonth(),
          rawDateTo.getDate(),
          23,
          59,
          59,
          999,
        )
      : undefined;

    const notes = await this.prisma.playerNote.findMany({
      where: { playerId, createdAt: { gte: dateFrom, lte: dateTo } },
      include: { author: true },
      orderBy: { createdAt: query.sortOrder ?? 'desc' },
    });

    if (requester.scope !== 'OWN') return notes;

    // Un Player ne voit jamais les notes PRIVE (staff uniquement) — même
    // tension RGPD Article 15 que pour PlayerInterview.staffAssessment.
    return notes.filter((note) => note.visibility !== 'PRIVE');
  }

  async update(
    clubId: number,
    playerId: number,
    id: number,
    dto: UpdatePlayerNoteDto,
    requester: PlayerNoteRequestContext,
  ) {
    await this.findNoteOrThrow(clubId, playerId, id, requester);

    return this.prisma.playerNote.update({
      where: { id },
      data: {
        visibility: dto.visibility,
        title: dto.title,
        content: dto.content,
      },
      include: { author: true },
    });
  }

  async remove(
    clubId: number,
    playerId: number,
    id: number,
    requester: PlayerNoteRequestContext,
  ) {
    await this.findNoteOrThrow(clubId, playerId, id, requester);
    await this.prisma.playerNote.delete({ where: { id } });
  }

  private async findNoteOrThrow(
    clubId: number,
    playerId: number,
    id: number,
    requester: PlayerNoteRequestContext,
  ) {
    await assertPlayerInClub(
      this.prisma,
      clubId,
      playerId,
      'PLAYER_NOTES.PLAYER_NOT_IN_CLUB',
    );
    if (requester.scope === 'TEAM') {
      await assertPlayerInTeam(this.prisma, playerId, requester.teamId);
    }

    const note = await this.prisma.playerNote.findFirst({
      where: { id, playerId },
    });
    if (!note) {
      throw new AppException('PLAYER_NOTES.NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return note;
  }
}
