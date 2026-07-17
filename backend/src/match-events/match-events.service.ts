import { HttpStatus, Injectable } from '@nestjs/common';
import type { HomeOrAway, MatchEventType } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { assertPlayerInTeam } from '../common/player-team-membership';
import { assertTeamInClub } from '../common/team-club-membership';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { CreateMatchEventDto } from './dto/create-match-event.dto';
import { UpdateMatchEventDto } from './dto/update-match-event.dto';

interface PlayerReferences {
  playerId?: number | null;
  relatedPlayerId?: number | null;
  externalPlayerId?: number | null;
}

// Types réservés à notre équipe (pas de pendant "adversaire" documenté,
// docs/schema/evenements.md §MatchEvent) : un csc/remplacement/pénalty côté
// adverse n'est pas tracké dans ce MVP.
const OWN_TEAM_ONLY_TYPES: MatchEventType[] = [
  'OWN_GOAL',
  'SUBSTITUTION',
  'PENALTY_SCORED',
  'PENALTY_MISSED',
];

/**
 * Événements live et post-match (docs/schema/evenements.md §MatchEvent,
 * docs/modules/matchs.md §Événements live, Phase 4 Partie C, C2), scopée
 * ÉQUIPE via `clubs/:clubId/teams/:teamId/matches/:matchId/events`.
 *
 * Aucune restriction basée sur `Match.status` (contrairement à
 * MatchPeriodsService) : "le score est recalculable à tout moment depuis
 * les événements" (docs/modules/matchs.md §Clôture du match) — ajouter un
 * événement manqué ou corriger une erreur reste possible après la clôture
 * du match, c'est même le cas d'usage explicite de la correction post-match
 * (Partie C, C5, uniquement une interface frontend distincte — le CRUD
 * backend est déjà celui-ci).
 */
@Injectable()
export class MatchEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async create(
    clubId: number,
    teamId: number,
    matchId: number,
    dto: CreateMatchEventDto,
  ) {
    const match = await this.findMatchOrThrow(clubId, teamId, matchId);
    const isOurs = dto.teamSide === match.homeOrAway;
    await this.assertValidPlayerReferences(
      clubId,
      teamId,
      dto.type,
      isOurs,
      dto,
    );

    return this.prisma.matchEvent.create({
      data: {
        matchId,
        type: dto.type,
        teamSide: dto.teamSide,
        periodNumber: dto.periodNumber,
        minute: dto.minute,
        playerId: dto.playerId,
        relatedPlayerId: dto.relatedPlayerId,
        externalPlayerId: dto.externalPlayerId,
        comment: dto.comment,
      },
    });
  }

  async update(
    clubId: number,
    teamId: number,
    matchId: number,
    id: number,
    dto: UpdateMatchEventDto,
  ) {
    const match = await this.findMatchOrThrow(clubId, teamId, matchId);
    const event = await this.findEventOrThrow(matchId, id);
    const isOurs = event.teamSide === match.homeOrAway;

    // Chaque champ non fourni dans dto conserve sa valeur existante — seuls
    // les champs effectivement modifiés sont re-validés dans leur nouvelle
    // combinaison (type/teamSide restent ceux de l'événement, immuables).
    const merged: PlayerReferences = {
      playerId: dto.playerId !== undefined ? dto.playerId : event.playerId,
      relatedPlayerId:
        dto.relatedPlayerId !== undefined
          ? dto.relatedPlayerId
          : event.relatedPlayerId,
      externalPlayerId:
        dto.externalPlayerId !== undefined
          ? dto.externalPlayerId
          : event.externalPlayerId,
    };
    await this.assertValidPlayerReferences(
      clubId,
      teamId,
      event.type,
      isOurs,
      merged,
    );

    return this.prisma.matchEvent.update({
      where: { id },
      data: {
        periodNumber: dto.periodNumber,
        minute: dto.minute,
        playerId: dto.playerId,
        relatedPlayerId: dto.relatedPlayerId,
        externalPlayerId: dto.externalPlayerId,
        comment: dto.comment,
      },
    });
  }

  async findAllByMatch(
    clubId: number,
    teamId: number,
    matchId: number,
    memberId: number,
  ) {
    await this.findMatchOrThrow(clubId, teamId, matchId);
    const [data, canManage] = await Promise.all([
      this.prisma.matchEvent.findMany({
        where: { matchId },
        orderBy: [{ periodNumber: 'asc' }, { minute: 'asc' }, { id: 'asc' }],
      }),
      this.canManage(clubId, teamId, memberId),
    ]);
    return { data, canManage };
  }

  async remove(clubId: number, teamId: number, matchId: number, id: number) {
    await this.findMatchOrThrow(clubId, teamId, matchId);
    await this.findEventOrThrow(matchId, id);
    await this.prisma.matchEvent.delete({ where: { id } });
  }

  // `canManage` reflète la capacité de saisir/corriger le live (bouton
  // "Ajouter un événement") — jamais déduit d'un rôle côté client (règle
  // CLAUDE.md). AdminClub n'a que READ sur match_event (docs/modules/
  // matchs.md §Droits par rôle), donc toujours canManage=false pour lui.
  private async canManage(clubId: number, teamId: number, memberId: number) {
    const scope = await this.permissionsService.can(
      memberId,
      'CREATE',
      'match_event',
      { clubId, teamId },
    );
    return !!scope;
  }

  // Règles du tableau docs/schema/evenements.md §MatchEvent : quels champs
  // joueur sont requis/interdits selon le type et le côté (notre équipe vs
  // adversaire). `externalPlayerId` reste TOUJOURS optionnel côté
  // adversaire (retour utilisateur du 2026-07-18) — jamais "requis".
  private async assertValidPlayerReferences(
    clubId: number,
    teamId: number,
    type: MatchEventType,
    isOurs: boolean,
    refs: PlayerReferences,
  ) {
    if (!isOurs && OWN_TEAM_ONLY_TYPES.includes(type)) {
      throw new AppException(
        'MATCH_EVENTS.TYPE_REQUIRES_OWN_TEAM',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!isOurs) {
      // Côté adversaire : jamais nos joueurs, seulement (éventuellement) un
      // ExternalPlayer.
      if (refs.playerId != null || refs.relatedPlayerId != null) {
        throw new AppException(
          'MATCH_EVENTS.PLAYER_NOT_ALLOWED_FOR_OPPONENT',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (refs.externalPlayerId != null) {
        await this.assertExternalPlayerInClub(clubId, refs.externalPlayerId);
      }
      return;
    }

    // Côté "notre équipe" : jamais d'ExternalPlayer.
    if (refs.externalPlayerId != null) {
      throw new AppException(
        'MATCH_EVENTS.EXTERNAL_PLAYER_NOT_ALLOWED_FOR_OWN_TEAM',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (type === 'SUBSTITUTION') {
      if (refs.playerId == null || refs.relatedPlayerId == null) {
        throw new AppException(
          'MATCH_EVENTS.SUBSTITUTION_REQUIRES_BOTH_PLAYERS',
          HttpStatus.BAD_REQUEST,
        );
      }
      await assertPlayerInTeam(this.prisma, refs.playerId, teamId);
      await assertPlayerInTeam(this.prisma, refs.relatedPlayerId, teamId);
      return;
    }

    // GOAL/OWN_GOAL/YELLOW_CARD/RED_CARD/PENALTY_SCORED/PENALTY_MISSED :
    // playerId requis, relatedPlayerId permis seulement pour GOAL (passeur).
    if (refs.playerId == null) {
      throw new AppException(
        'MATCH_EVENTS.PLAYER_REQUIRED',
        HttpStatus.BAD_REQUEST,
      );
    }
    await assertPlayerInTeam(this.prisma, refs.playerId, teamId);

    if (refs.relatedPlayerId != null) {
      if (type !== 'GOAL') {
        throw new AppException(
          'MATCH_EVENTS.RELATED_PLAYER_NOT_ALLOWED',
          HttpStatus.BAD_REQUEST,
        );
      }
      await assertPlayerInTeam(this.prisma, refs.relatedPlayerId, teamId);
    }
  }

  private async assertExternalPlayerInClub(
    clubId: number,
    externalPlayerId: number,
  ) {
    const externalPlayer = await this.prisma.externalPlayer.findFirst({
      where: { id: externalPlayerId, clubId },
    });
    if (!externalPlayer) {
      throw new AppException(
        'MATCH_EVENTS.EXTERNAL_PLAYER_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  private async findMatchOrThrow(
    clubId: number,
    teamId: number,
    matchId: number,
  ): Promise<{ id: number; homeOrAway: HomeOrAway }> {
    await assertTeamInClub(
      this.prisma,
      clubId,
      teamId,
      'MATCH_EVENTS.TEAM_NOT_IN_CLUB',
    );
    const match = await this.prisma.match.findFirst({
      where: { id: matchId, event: { teamId } },
      select: { id: true, homeOrAway: true },
    });
    if (!match) {
      throw new AppException(
        'MATCH_EVENTS.MATCH_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return match;
  }

  private async findEventOrThrow(matchId: number, id: number) {
    const event = await this.prisma.matchEvent.findFirst({
      where: { id, matchId },
    });
    if (!event) {
      throw new AppException('MATCH_EVENTS.NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return event;
  }
}
