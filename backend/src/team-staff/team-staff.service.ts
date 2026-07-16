import { HttpStatus, Injectable } from '@nestjs/common';
import type { PermissionScope, Prisma, TeamStaffRole } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { assertTeamInClub } from '../common/team-club-membership';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamStaffDto } from './dto/create-team-staff.dto';
import { UpdateTeamStaffDto } from './dto/update-team-staff.dto';

export interface StaffRequestContext {
  memberId: number;
  scope: PermissionScope;
}

// Nom du rôle système accordé automatiquement à toute affectation TeamStaff
// (PRINCIPAL/CO_ENTRAINEUR/ADJOINT confondus — la distinction n'existe qu'au
// niveau TeamStaff.staffRole, pas au niveau RBAC, voir plus bas).
const COACH_ROLE_NAME = 'Coach';

/**
 * Gère l'affectation staff ↔ équipe (docs/schema/joueurs.md — TeamStaff) ET
 * le MemberRole `Coach` (scopé équipe) qui en découle — les deux sont créés/
 * révoqués ensemble dans une même transaction : un TeamStaff sans MemberRole
 * correspondant (ou l'inverse) est exactement le bug constaté en usage réel
 * qui a motivé cette écriture jointe (voir docs/modules/effectif-joueurs.md
 * §Staff d'équipe).
 *
 * Parité complète PRINCIPAL/CO_ENTRAINEUR/ADJOINT sur la gestion du staff,
 * à deux exceptions près, aucune n'exprimable dans le système de permission
 * générique (même rôle, même scope, seule la ligne/valeur cible diffère) —
 * appliquées ici, explicitement :
 * - un détenteur d'un accès scopé TEAM (donc un membre du staff, pas un
 *   AdminClub/SuperAdmin/Proprietaire en CLUB/ALL) ne peut pas modifier ou
 *   retirer la fiche d'un PRINCIPAL autre que la sienne (protection contre
 *   l'auto-promotion, préexistant) ;
 * - créer une affectation nécessite d'être soi-même le PRINCIPAL de cette
 *   équipe (scope TEAM) ou un scope CLUB/ALL ; et assigner le rôle PRINCIPAL
 *   (à la création ou par promotion via update) est réservé au scope CLUB/ALL
 *   — même le PRINCIPAL en poste ne peut pas se remplacer ou se dupliquer
 *   lui-même (décision produit du 2026-07-16).
 */
@Injectable()
export class TeamStaffService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    clubId: number,
    teamId: number,
    dto: CreateTeamStaffDto,
    requester: StaffRequestContext,
  ) {
    await assertTeamInClub(
      this.prisma,
      clubId,
      teamId,
      'TEAM_STAFF.TEAM_NOT_IN_CLUB',
    );
    await this.assertMemberInClub(clubId, dto.memberId);
    await this.assertCanCreateStaff(teamId, requester);
    this.assertCanAssignPrincipal(dto.staffRole, requester);

    return this.prisma.$transaction(async (tx) => {
      const activeAssignment = await tx.teamStaff.findFirst({
        where: { memberId: dto.memberId, teamId, endDate: null },
      });
      if (activeAssignment) {
        throw new AppException(
          'TEAM_STAFF.ALREADY_ACTIVE',
          HttpStatus.CONFLICT,
        );
      }

      const assignment = await tx.teamStaff.create({
        data: {
          memberId: dto.memberId,
          teamId,
          staffRole: dto.staffRole,
          startDate: dto.startDate,
        },
      });

      const coachRole = await this.findCoachRole(tx);
      await tx.memberRole.create({
        data: {
          memberId: dto.memberId,
          roleId: coachRole.id,
          clubId,
          teamId,
          startDate: dto.startDate,
        },
      });

      return assignment;
    });
  }

  async findAllByTeam(clubId: number, teamId: number) {
    await assertTeamInClub(
      this.prisma,
      clubId,
      teamId,
      'TEAM_STAFF.TEAM_NOT_IN_CLUB',
    );

    return this.prisma.teamStaff.findMany({
      where: { teamId, endDate: null },
      orderBy: { staffRole: 'asc' },
    });
  }

  // Action de premier ordre pour le bouton "Archiver" du tableau effectif
  // (docs/modules/effectif-joueurs.md) plutôt qu'un PATCH générique — délègue
  // entièrement à update() (mêmes vérifications, y compris
  // assertCanModifyPrincipal), fixe juste endDate à aujourd'hui si aucune
  // date n'est choisie.
  async archive(
    clubId: number,
    teamId: number,
    id: number,
    requester: StaffRequestContext,
    endDate?: Date,
  ) {
    return this.update(
      clubId,
      teamId,
      id,
      { endDate: endDate ?? new Date() },
      requester,
    );
  }

  async update(
    clubId: number,
    teamId: number,
    id: number,
    dto: UpdateTeamStaffDto,
    requester: StaffRequestContext,
  ) {
    const assignment = await this.findAssignmentOrThrow(clubId, teamId, id);
    this.assertCanModifyPrincipal(assignment, requester);
    this.assertCanAssignPrincipal(
      dto.staffRole,
      requester,
      assignment.staffRole,
    );

    // Bascule active → terminée dans ce même appel (archivage, ou update
    // direct avec endDate) : révoque le MemberRole Coach en même temps que
    // le TeamStaff, jamais l'un sans l'autre.
    const isEndingNow =
      dto.endDate !== undefined && assignment.endDate === null;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.teamStaff.update({
        where: { id },
        data: {
          staffRole: dto.staffRole,
          startDate: dto.startDate,
          endDate: dto.endDate,
        },
      });

      if (isEndingNow) {
        await this.revokeCoachMemberRole(
          tx,
          assignment.memberId,
          clubId,
          teamId,
          dto.endDate as Date,
        );
      }

      return updated;
    });
  }

  async remove(
    clubId: number,
    teamId: number,
    id: number,
    requester: StaffRequestContext,
  ) {
    const assignment = await this.findAssignmentOrThrow(clubId, teamId, id);
    this.assertCanModifyPrincipal(assignment, requester);

    await this.prisma.$transaction(async (tx) => {
      if (assignment.endDate === null) {
        await this.revokeCoachMemberRole(
          tx,
          assignment.memberId,
          clubId,
          teamId,
          new Date(),
        );
      }
      await tx.teamStaff.delete({ where: { id } });
    });
  }

  private assertCanModifyPrincipal(
    assignment: { staffRole: string; memberId: number },
    requester: StaffRequestContext,
  ) {
    const isSelf = assignment.memberId === requester.memberId;
    if (
      requester.scope === 'TEAM' &&
      assignment.staffRole === 'PRINCIPAL' &&
      !isSelf
    ) {
      throw new AppException(
        'TEAM_STAFF.CANNOT_MODIFY_PRINCIPAL',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  // Créer une affectation (scope TEAM) est réservé au PRINCIPAL en poste sur
  // CETTE équipe — un Co-entraîneur/Adjoint ne peut pas ajouter de staff,
  // seulement un scope CLUB/ALL (AdminClub/SuperAdmin/Proprietaire) ou le
  // Principal lui-même (décision produit du 2026-07-16).
  private async assertCanCreateStaff(
    teamId: number,
    requester: StaffRequestContext,
  ) {
    if (requester.scope !== 'TEAM') {
      return;
    }
    const requesterAssignment = await this.prisma.teamStaff.findFirst({
      where: { teamId, memberId: requester.memberId, endDate: null },
    });
    if (requesterAssignment?.staffRole !== 'PRINCIPAL') {
      throw new AppException(
        'TEAM_STAFF.ONLY_PRINCIPAL_CAN_CREATE',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  // Assigner PRINCIPAL (création OU promotion via update) est réservé au
  // scope CLUB/ALL — même le Principal en poste ne peut ni se remplacer ni
  // se dupliquer via cet endpoint. `currentStaffRole` absent (création) ou
  // déjà PRINCIPAL (auto-édition sans changement de rôle, ex. dates) ne
  // déclenchent pas cette règle dans ce dernier cas — seule une PROMOTION
  // réelle (staffRole cible PRINCIPAL, staffRole actuel différent ou absent)
  // est bloquée.
  private assertCanAssignPrincipal(
    targetStaffRole: TeamStaffRole | undefined,
    requester: StaffRequestContext,
    currentStaffRole?: TeamStaffRole,
  ) {
    if (requester.scope !== 'TEAM') return;
    if (targetStaffRole !== 'PRINCIPAL') return;
    if (currentStaffRole === 'PRINCIPAL') return;
    throw new AppException(
      'TEAM_STAFF.ONLY_ADMIN_CAN_ASSIGN_PRINCIPAL',
      HttpStatus.FORBIDDEN,
    );
  }

  private async findCoachRole(tx: Prisma.TransactionClient) {
    const role = await tx.role.findFirst({
      where: { name: COACH_ROLE_NAME, isSystem: true, clubId: null },
    });
    if (!role) {
      throw new AppException(
        'TEAM_STAFF.COACH_ROLE_MISSING',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return role;
  }

  // Révoque (endDate, jamais une suppression — cohérent avec
  // isDateRangeActive/PermissionsService) le MemberRole Coach actif
  // correspondant à cette affectation, s'il existe — silencieux s'il est
  // absent (affectation créée avant l'introduction de cette écriture
  // jointe, ex. correctif manuel en base) : la révocation ne doit jamais
  // faire échouer l'archivage/retrait du TeamStaff lui-même.
  private async revokeCoachMemberRole(
    tx: Prisma.TransactionClient,
    memberId: number,
    clubId: number,
    teamId: number,
    endDate: Date,
  ) {
    const activeMemberRole = await tx.memberRole.findFirst({
      where: {
        memberId,
        clubId,
        teamId,
        endDate: null,
        role: { name: COACH_ROLE_NAME, isSystem: true },
      },
    });
    if (!activeMemberRole) {
      return;
    }
    await tx.memberRole.update({
      where: { id: activeMemberRole.id },
      data: { endDate },
    });
  }

  private async findAssignmentOrThrow(
    clubId: number,
    teamId: number,
    id: number,
  ) {
    const assignment = await this.prisma.teamStaff.findFirst({
      where: { id, teamId, team: { clubId } },
    });
    if (!assignment) {
      throw new AppException('TEAM_STAFF.NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return assignment;
  }

  private async assertMemberInClub(clubId: number, memberId: number) {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, clubId },
    });
    if (!member) {
      throw new AppException(
        'TEAM_STAFF.MEMBER_NOT_IN_CLUB',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
