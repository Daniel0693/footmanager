import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  Gender,
  Member,
  PlayerTeam,
  Position,
  Prisma,
  TeamStaffRole,
} from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { assertTeamInClub } from '../common/team-club-membership';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { CreateRosterRowDto } from './dto/create-roster-row.dto';
import {
  FindRosterQueryDto,
  RosterSortBy,
  RosterStatus,
} from './dto/find-roster-query.dto';
import { UpdateRosterRowDto } from './dto/update-roster-row.dto';

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
  // Id du PlayerProfile — null pour une ligne staff. Le frontend en a besoin
  // pour rouvrir PlayerFormDialog (existant, B5) en édition, qui cible
  // GET/PATCH /clubs/:clubId/players/:playerId — un id distinct de `id`
  // (PlayerTeam) et de `memberId` (Member).
  playerId: number | null;
  role: 'PLAYER' | TeamStaffRole;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  gender: Gender | null;
  birthDate: Date | null;
  jerseyNumber: number | null;
  mainPosition: Position | null;
  secondaryPositions: Position[];
  // Null pour le staff : PlayerTeam.joinDate n'existe pas sur TeamStaff.
  // Toujours déjà chargé (assignment/member complets), aucun coût réseau
  // supplémentaire — exposé pour que le frontend puisse pré-remplir
  // gender/joinDate en édition (B5.4, sinon perdus/vides à tort).
  joinDate: Date | null;
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

// Miroir exact de l'ordre de déclaration de l'enum Prisma `Position`
// (schema.prisma) : Gardien → Défenseur → Milieu → Attaquant "gratuit" par
// construction (retour utilisateur 2026-07-13 — tri par ligne, pas
// alphabétique). Même principe que ROLE_SORT_RANK ci-dessus.
const POSITION_SORT_RANK: Record<Position, number> = {
  GK: 0,
  CB: 1,
  RB: 2,
  LB: 3,
  RWB: 4,
  LWB: 5,
  CDM: 6,
  CM: 7,
  RM: 8,
  LM: 9,
  CAM: 10,
  RW: 11,
  LW: 12,
  CF: 13,
  ST: 14,
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
  ): Promise<{
    data: RosterRow[];
    total: number;
    canViewArchived: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
  }> {
    const { clubId, teamId } = requester;
    await assertTeamInClub(
      this.prisma,
      clubId,
      teamId,
      'ROSTER.TEAM_NOT_IN_CLUB',
    );

    const status = query.status ?? 'ACTIVE';
    // Calculées une seule fois, réutilisées à la fois pour garder/refuser
    // l'accès à status != ACTIVE ET pour indiquer au frontend quels
    // contrôles afficher (docs/modules/effectif-joueurs.md) — sans exposer
    // de nouvel endpoint "mes permissions", cohérent avec la convention du
    // projet ("permission toujours évaluée backend").
    const [archiveScope, createScope, editScope, deleteScope] =
      await Promise.all([
        this.permissionsService.can(
          requester.memberId,
          'READ',
          'roster_archive',
          {
            clubId,
            teamId,
          },
        ),
        this.permissionsService.can(
          requester.memberId,
          'CREATE',
          'player_team',
          {
            clubId,
            teamId,
          },
        ),
        this.permissionsService.can(
          requester.memberId,
          'UPDATE',
          'player_team',
          {
            clubId,
            teamId,
          },
        ),
        this.permissionsService.can(requester.memberId, 'DELETE', 'member', {
          clubId,
          teamId,
        }),
      ]);

    if (status !== 'ACTIVE' && !archiveScope) {
      throw new AppException('ROSTER.ARCHIVE_FORBIDDEN', HttpStatus.FORBIDDEN);
    }

    // Un filtre par poste n'a de sens que pour les joueurs (voir DTO) : le
    // staff ne peut jamais y correspondre, donc on ne va même pas le
    // chercher plutôt que de le renvoyer pour le filtrer ensuite.
    const players = await this.findPlayerRows(teamId, status, query.position);
    const staff =
      query.position && query.position.length > 0
        ? []
        : await this.findStaffRows(requester, teamId, status);

    let merged = [...players, ...staff];
    // Recherche texte insensible à la casse sur prénom/nom (retour
    // utilisateur 2026-07-13) : appliquée en mémoire comme le tri/la
    // pagination ci-dessous (voir commentaire d'architecture en tête de
    // fichier) — aucune requête SQL supplémentaire.
    const needle = query.search?.trim().toLowerCase();
    if (needle) {
      merged = merged.filter(
        (row) =>
          row.firstName.toLowerCase().includes(needle) ||
          row.lastName.toLowerCase().includes(needle),
      );
    }
    this.sortRows(merged, query.sortBy ?? 'lastName', query.sortOrder ?? 'asc');

    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const page = query.page ?? 1;
    const start = (page - 1) * pageSize;

    return {
      data: merged.slice(start, start + pageSize),
      total: merged.length,
      canViewArchived: !!archiveScope,
      canCreate: !!createScope,
      canEdit: !!editScope,
      canDelete: !!deleteScope,
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

    return assignments.map((assignment) =>
      this.toPlayerRow(
        assignment,
        assignment.player.member,
        assignment.player.member.user?.email ?? null,
      ),
    );
  }

  // Partagé entre la lecture (B1) et le bulk create/update (B4) : un membre
  // fraîchement créé ou mis à jour via $transaction n'a jamais la relation
  // `user` incluse (Prisma ne la renvoie que si explicitement demandée) —
  // l'email est donc résolu par l'appelant plutôt que dérivé ici, pour
  // rester correct dans les deux contextes (toujours `null` à la création,
  // potentiellement un email réel après une mise à jour avec `include`).
  private toPlayerRow(
    assignment: PlayerTeam,
    member: Member,
    email: string | null,
  ): RosterRow {
    return {
      id: assignment.id,
      memberId: member.id,
      playerId: assignment.playerId,
      role: 'PLAYER',
      firstName: member.firstName,
      lastName: member.lastName,
      phone: member.phone,
      email,
      gender: member.gender,
      birthDate: member.birthDate,
      jerseyNumber: assignment.jerseyNumber,
      mainPosition: assignment.mainPosition,
      joinDate: assignment.joinDate,
      secondaryPositions: assignment.secondaryPositions,
      isArchived: assignment.leaveDate !== null,
    };
  }

  /**
   * Création en masse (B4) : une seule transaction pour toutes les lignes,
   * tout-ou-rien (décision produit) — Member + PlayerProfile + PlayerTeam
   * par ligne, contre trois appels distincts avec l'API existante.
   * L'unicité du numéro de maillot est vérifiée ligne par ligne DANS la
   * transaction : chaque insertion devient visible aux vérifications
   * suivantes de la même transaction, ce qui détecte aussi bien un conflit
   * avec une affectation déjà active qu'un doublon entre deux lignes du
   * même envoi, sans logique dédiée aux doublons intra-lot.
   */
  async bulkCreate(
    clubId: number,
    teamId: number,
    items: CreateRosterRowDto[],
  ): Promise<RosterRow[]> {
    await assertTeamInClub(
      this.prisma,
      clubId,
      teamId,
      'ROSTER.TEAM_NOT_IN_CLUB',
    );

    return this.prisma.$transaction(async (tx) => {
      const created: RosterRow[] = [];
      for (const item of items) {
        if (item.jerseyNumber !== undefined) {
          await this.assertJerseyNumberAvailable(tx, teamId, item.jerseyNumber);
        }
        const member = await tx.member.create({
          data: {
            clubId,
            firstName: item.firstName,
            lastName: item.lastName,
            phone: item.phone,
            gender: item.gender,
            birthDate: item.birthDate,
          },
        });
        const player = await tx.playerProfile.create({
          data: { memberId: member.id },
        });
        const assignment = await tx.playerTeam.create({
          data: {
            playerId: player.id,
            teamId,
            jerseyNumber: item.jerseyNumber,
            mainPosition: item.mainPosition,
            secondaryPositions: item.secondaryPositions ?? [],
            joinDate: item.joinDate,
          },
        });
        // Jamais de User à la création en masse (pas de compte de
        // connexion, même convention que CreateMemberDto) : email toujours
        // null pour une ligne fraîchement créée.
        created.push(this.toPlayerRow(assignment, member, null));
      }
      return created;
    });
  }

  /**
   * Mise à jour en masse (B4) : même principe transactionnel que
   * bulkCreate. `id` cible le PlayerTeam existant (voir UpdateRosterRowDto).
   */
  async bulkUpdate(
    clubId: number,
    teamId: number,
    items: UpdateRosterRowDto[],
  ): Promise<RosterRow[]> {
    await assertTeamInClub(
      this.prisma,
      clubId,
      teamId,
      'ROSTER.TEAM_NOT_IN_CLUB',
    );

    return this.prisma.$transaction(async (tx) => {
      const updated: RosterRow[] = [];
      for (const item of items) {
        const assignment = await tx.playerTeam.findFirst({
          where: { id: item.id, teamId, team: { clubId } },
          include: { player: true },
        });
        if (!assignment) {
          throw new AppException(
            'ROSTER.PLAYER_TEAM_NOT_FOUND',
            HttpStatus.NOT_FOUND,
          );
        }
        if (
          item.jerseyNumber !== undefined &&
          item.jerseyNumber !== assignment.jerseyNumber
        ) {
          await this.assertJerseyNumberAvailable(
            tx,
            teamId,
            item.jerseyNumber,
            item.id,
          );
        }

        const member = await tx.member.update({
          where: { id: assignment.player.memberId },
          data: {
            firstName: item.firstName,
            lastName: item.lastName,
            phone: item.phone,
            gender: item.gender,
            birthDate: item.birthDate,
          },
          include: { user: true },
        });
        const updatedAssignment = await tx.playerTeam.update({
          where: { id: item.id },
          data: {
            jerseyNumber: item.jerseyNumber,
            mainPosition: item.mainPosition,
            secondaryPositions: item.secondaryPositions,
            joinDate: item.joinDate,
            leaveDate: item.leaveDate,
          },
        });
        updated.push(
          this.toPlayerRow(
            updatedAssignment,
            member,
            member.user?.email ?? null,
          ),
        );
      }
      return updated;
    });
  }

  // Même vérification que PlayerTeamsService.assertJerseyNumberAvailable
  // (pas de contrainte SQL sur (teamId, jerseyNumber), voir
  // docs/schema/joueurs.md), réécrite ici pour opérer sur le client de
  // transaction du bulk plutôt que sur `this.prisma` directement.
  private async assertJerseyNumberAvailable(
    tx: Prisma.TransactionClient,
    teamId: number,
    jerseyNumber: number,
    excludeId?: number,
  ) {
    const conflict = await tx.playerTeam.findFirst({
      where: {
        teamId,
        jerseyNumber,
        leaveDate: null,
        ...(excludeId !== undefined ? { id: { not: excludeId } } : {}),
      },
    });
    if (conflict) {
      throw new AppException('ROSTER.JERSEY_NUMBER_TAKEN', HttpStatus.CONFLICT);
    }
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
      playerId: null,
      role: assignment.staffRole,
      firstName: assignment.member.firstName,
      lastName: assignment.member.lastName,
      phone: assignment.member.phone,
      email: assignment.member.user?.email ?? null,
      gender: assignment.member.gender,
      birthDate: assignment.member.birthDate,
      jerseyNumber: null,
      mainPosition: null,
      secondaryPositions: [],
      joinDate: null,
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
    if (sortBy === 'firstName') {
      return (
        a.firstName.localeCompare(b.firstName) ||
        a.lastName.localeCompare(b.lastName)
      );
    }
    if (sortBy === 'mainPosition') {
      return this.compareNullable(
        a.mainPosition ? POSITION_SORT_RANK[a.mainPosition] : undefined,
        b.mainPosition ? POSITION_SORT_RANK[b.mainPosition] : undefined,
        direction,
      );
    }
    if (sortBy === 'secondaryPositions') {
      return this.compareNullable(
        this.bestSecondaryPositionRank(a.secondaryPositions),
        this.bestSecondaryPositionRank(b.secondaryPositions),
        direction,
      );
    }
    // lastName : nom puis prénom pour départager les homonymes.
    return (
      a.lastName.localeCompare(b.lastName) ||
      a.firstName.localeCompare(b.firstName)
    );
  }

  // Rang du meilleur poste secondaire (le plus proche du gardien dans
  // POSITION_SORT_RANK) — décision produit du 2026-07-13 : classer par le
  // poste secondaire le plus "senior" plutôt que par leur nombre. `undefined`
  // (tableau vide) est traité comme null par compareNullable, donc toujours
  // en fin de liste dans les deux sens.
  private bestSecondaryPositionRank(positions: Position[]): number | undefined {
    if (positions.length === 0) return undefined;
    return Math.min(
      ...positions.map((position) => POSITION_SORT_RANK[position]),
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
