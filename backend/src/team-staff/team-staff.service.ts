import { HttpStatus, Injectable } from '@nestjs/common';
import type { PermissionScope } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamStaffDto } from './dto/create-team-staff.dto';
import { UpdateTeamStaffDto } from './dto/update-team-staff.dto';

export interface StaffRequestContext {
  memberId: number;
  scope: PermissionScope;
}

/**
 * Gère l'affectation staff ↔ équipe (docs/schema/joueurs.md — TeamStaff).
 * Parité complète PRINCIPAL/CO_ENTRAINEUR/ADJOINT sur la gestion du staff,
 * à une exception près : un détenteur d'un accès scopé TEAM (donc un membre
 * du staff, pas un AdminClub/SuperAdmin en CLUB/ALL) ne peut pas modifier ou
 * retirer la fiche d'un PRINCIPAL autre que la sienne — protection contre
 * l'auto-promotion. Cette règle n'est pas exprimable dans le système de
 * permission générique (même rôle, même scope, seule la ligne cible
 * diffère) : elle est donc appliquée ici, explicitement.
 */
@Injectable()
export class TeamStaffService {
  constructor(private readonly prisma: PrismaService) {}

  async create(clubId: number, teamId: number, dto: CreateTeamStaffDto) {
    await this.assertTeamInClub(clubId, teamId);
    await this.assertMemberInClub(clubId, dto.memberId);

    const activeAssignment = await this.prisma.teamStaff.findFirst({
      where: { memberId: dto.memberId, teamId, endDate: null },
    });
    if (activeAssignment) {
      throw new AppException('TEAM_STAFF.ALREADY_ACTIVE', HttpStatus.CONFLICT);
    }

    return this.prisma.teamStaff.create({
      data: {
        memberId: dto.memberId,
        teamId,
        staffRole: dto.staffRole,
        startDate: dto.startDate,
      },
    });
  }

  async findAllByTeam(clubId: number, teamId: number) {
    await this.assertTeamInClub(clubId, teamId);

    return this.prisma.teamStaff.findMany({
      where: { teamId, endDate: null },
      orderBy: { staffRole: 'asc' },
    });
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

    return this.prisma.teamStaff.update({
      where: { id },
      data: {
        staffRole: dto.staffRole,
        startDate: dto.startDate,
        endDate: dto.endDate,
      },
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

    await this.prisma.teamStaff.delete({ where: { id } });
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

  private async assertTeamInClub(clubId: number, teamId: number) {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, clubId },
    });
    if (!team) {
      throw new AppException(
        'TEAM_STAFF.TEAM_NOT_IN_CLUB',
        HttpStatus.BAD_REQUEST,
      );
    }
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
