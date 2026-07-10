import { HttpStatus, Injectable } from '@nestjs/common';
import type { Position, TeamStaffRole } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { assertTeamInClub } from '../common/team-club-membership';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import {
  FindRosterQueryDto,
  RosterSortBy,
  RosterStatus,
} from './dto/find-roster-query.dto';

export interface RosterRequestContext {
  memberId: number;
  clubId: number;
  teamId: number;
}

// "PLAYER" ne fait pas partie de l'enum Prisma TeamStaffRole (PRINCIPAL/
// CO_ENTRAINEUR/ADJOINT) : ligne du tableau unifié joueurs + staff, pas une
// entité Prisma — voir docs/modules/effectif-joueurs.md.
export interface RosterRow {
  // Id de la ligne PlayerTeam ou TeamStaff sous-jacente (pas le memberId) —
  // c'est cet id que cibleront les actions Archiver/Éditer (B2/B5), qui
  // opèrent sur des endpoints déjà scindés .../players/:id et .../staff/:id.
  id: number;
  memberId: number;
  role: 'PLAYER' | TeamStaffRole;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  birthDate: Date | null;
  jerseyNumber: number | null;
  mainPosition: Position | null;
  secondaryPositions: Position[];
  isArchived: boolean;
}

const DEFAULT_PAGE_SIZE = 20;

// Ordre volontairement staff-d'abord (le Principal en tête) plutôt
// qu'alphabétique — plus lisible dans un tableau mêlant joueurs et staff.
const ROLE_SORT_RANK: Record<RosterRow['role'], number> = {
  PRINCIPAL: 0,
  CO_ENTRAINEUR: 1,
  ADJOINT: 2,
  PLAYER: 3,
};

/**
 * Vue en lecture unifiée Joueurs + Staff d'une équipe (docs/modules/
 * effectif-joueurs.md) : deux requêtes Prisma indépendantes (PlayerTeam,
 * TeamStaff) normalisées en une forme commune, puis fusionnées/triées/
 * paginées en mémoire — le volume par équipe reste de l'ordre de quelques
 * dizaines de lignes, une jointure SQL unifiée entre deux tables aussi
 * différentes serait plus complexe que le gain n'en vaut la peine.
 */
@Injectable()
export class RosterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async findAllByTeam(
    requester: RosterRequestContext,
    query: FindRosterQueryDto = {},
  ): Promise<{ data: RosterRow[]; total: number }> {
    const { clubId, teamId } = requester;
    await assertTeamInClub(
      this.prisma,
      clubId,
      teamId,
      'ROSTER.TEAM_NOT_IN_CLUB',
    );

    const status = query.status ?? 'ACTIVE';
    if (status !== 'ACTIVE') {
      const archiveScope = await this.permissionsService.can(
        requester.memberId,
        'READ',
        'roster_archive',
        { clubId, teamId },
      );
      if (!archiveScope) {
        throw new AppException(
          'ROSTER.ARCHIVE_FORBIDDEN',
          HttpStatus.FORBIDDEN,
        );
      }
    }

    // Un filtre par poste n'a de sens que pour les joueurs (voir DTO) : le
    // staff ne peut jamais y correspondre, donc on ne va même pas le
    // chercher plutôt que de le renvoyer pour le filtrer ensuite.
    const players = await this.findPlayerRows(teamId, status, query.position);
    const staff =
      query.position && query.position.length > 0
        ? []
        : await this.findStaffRows(requester, teamId, status);

    const merged = [...players, ...staff];
    this.sortRows(merged, query.sortBy ?? 'lastName', query.sortOrder ?? 'asc');

    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const page = query.page ?? 1;
    const start = (page - 1) * pageSize;

    return {
      data: merged.slice(start, start + pageSize),
      total: merged.length,
    };
  }

  private async findPlayerRows(
    teamId: number,
    status: RosterStatus,
    position: Position[] | undefined,
  ): Promise<RosterRow[]> {
    const assignments = await this.prisma.playerTeam.findMany({
      where: {
        teamId,
        leaveDate: this.statusFilter(status),
        mainPosition:
          position && position.length > 0 ? { in: position } : undefined,
      },
      include: { player: { include: { member: { include: { user: true } } } } },
    });

    return assignments.map((assignment) => {
      const member = assignment.player.member;
      return {
        id: assignment.id,
        memberId: member.id,
        role: 'PLAYER',
        firstName: member.firstName,
        lastName: member.lastName,
        phone: member.phone,
        email: member.user?.email ?? null,
        birthDate: member.birthDate,
        jerseyNumber: assignment.jerseyNumber,
        mainPosition: assignment.mainPosition,
        secondaryPositions: assignment.secondaryPositions,
        isArchived: assignment.leaveDate !== null,
      };
    });
  }

  private async findStaffRows(
    requester: RosterRequestContext,
    teamId: number,
    status: RosterStatus,
  ): Promise<RosterRow[]> {
    // Dégradation silencieuse plutôt que 403 : un appelant qui a le droit de
    // voir les joueurs (guard sur player_team READ) mais pas le staff (rôle
    // personnalisé restreint) voit un roster partiel, pas une erreur.
    const staffScope = await this.permissionsService.can(
      requester.memberId,
      'READ',
      'team_staff',
      { clubId: requester.clubId, teamId },
    );
    if (!staffScope) return [];

    const assignments = await this.prisma.teamStaff.findMany({
      where: { teamId, endDate: this.statusFilter(status) },
      include: { member: { include: { user: true } } },
    });

    return assignments.map((assignment) => ({
      id: assignment.id,
      memberId: assignment.member.id,
      role: assignment.staffRole,
      firstName: assignment.member.firstName,
      lastName: assignment.member.lastName,
      phone: assignment.member.phone,
      email: assignment.member.user?.email ?? null,
      birthDate: assignment.member.birthDate,
      jerseyNumber: null,
      mainPosition: null,
      secondaryPositions: [],
      isArchived: assignment.endDate !== null,
    }));
  }

  private statusFilter(status: RosterStatus): { not: null } | null | undefined {
    if (status === 'ACTIVE') return null;
    if (status === 'ARCHIVED') return { not: null };
    return undefined;
  }

  private sortRows(
    rows: RosterRow[],
    sortBy: RosterSortBy,
    sortOrder: 'asc' | 'desc',
  ) {
    const direction = sortOrder === 'desc' ? -1 : 1;
    rows.sort((a, b) => direction * this.compare(a, b, sortBy, direction));
  }

  private compare(
    a: RosterRow,
    b: RosterRow,
    sortBy: RosterSortBy,
    direction: 1 | -1,
  ): number {
    if (sortBy === 'role') {
      return ROLE_SORT_RANK[a.role] - ROLE_SORT_RANK[b.role];
    }
    if (sortBy === 'jerseyNumber') {
      return this.compareNullable(a.jerseyNumber, b.jerseyNumber, direction);
    }
    if (sortBy === 'birthDate') {
      return this.compareNullable(
        a.birthDate?.getTime(),
        b.birthDate?.getTime(),
        direction,
      );
    }
    if (sortBy === 'phone' || sortBy === 'email') {
      return this.compareNullable(a[sortBy], b[sortBy], direction);
    }
    // lastName : nom puis prénom pour départager les homonymes.
    return (
      a.lastName.localeCompare(b.lastName) ||
      a.firstName.localeCompare(b.firstName)
    );
  }

  // Valeurs nulles toujours en fin de liste, quel que soit le sens du tri —
  // convention UX usuelle (une case vide n'est ni "plus petite" ni "plus
  // grande", elle est simplement reléguée après les vraies valeurs). Le
  // résultat brut est ensuite remultiplié par `direction` dans sortRows :
  // on neutralise cette inversion pour le placement des nulls en le
  // remultipliant nous-mêmes une fois (direction² = 1 pour les vraies
  // valeurs comparées, mais le signe du placement des nulls, lui, reste
  // fixe).
  private compareNullable<T extends number | string>(
    a: T | null | undefined,
    b: T | null | undefined,
    direction: 1 | -1,
  ): number {
    if (a === null || a === undefined) {
      return b === null || b === undefined ? 0 : direction;
    }
    if (b === null || b === undefined) return -direction;
    return a < b ? -1 : a > b ? 1 : 0;
  }
}
