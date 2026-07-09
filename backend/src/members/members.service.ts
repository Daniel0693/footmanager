import { HttpStatus, Injectable } from '@nestjs/common';
import type { Gender } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { computeYearlyOccurrences } from '../common/yearly-occurrence';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';

export interface MemberBirthday {
  memberId: number;
  firstName: string;
  lastName: string;
  date: Date;
  age: number;
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  create(data: {
    userId?: number;
    clubId: number;
    firstName: string;
    lastName: string;
    phone?: string;
    avatarUrl?: string;
    gender?: Gender;
    birthDate?: Date;
  }) {
    return this.prisma.member.create({ data });
  }

  async update(
    clubId: number,
    id: number,
    data: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      gender?: Gender;
      birthDate?: Date;
    },
  ) {
    const member = await this.prisma.member.findFirst({
      where: { id, clubId },
    });
    if (!member) {
      throw new AppException('MEMBERS.NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    return this.prisma.member.update({ where: { id }, data });
  }

  findByUserAndClub(userId: number, clubId: number) {
    return this.prisma.member.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
  }

  /**
   * "Mon profil" (docs/roadmap.md) : accès à ses propres données par
   * construction (le Member est résolu depuis le JWT via userId+clubId),
   * donc pas de scope RBAC à évaluer ici. Contourne volontairement
   * PermissionsGuard — même raison que PlayersService.findMe : un Coach/
   * Player a un MemberRole scopé équipe, ce qui empêcherait toute
   * correspondance de scope sur une route sans teamId dans l'URL.
   */
  async findMe(clubId: number, userId: number) {
    const member = await this.findByUserAndClub(userId, clubId);
    if (!member) {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    return member;
  }

  async updateMe(clubId: number, userId: number, data: { birthDate?: Date }) {
    const member = await this.findByUserAndClub(userId, clubId);
    if (!member) {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    return this.prisma.member.update({ where: { id: member.id }, data });
  }

  findById(id: number) {
    return this.prisma.member.findUnique({
      where: { id },
      include: { memberRoles: true },
    });
  }

  /**
   * Anniversaires visibles par l'appelant dans la fenêtre [dateFrom, dateTo]
   * (docs/modules/calendrier-evenements.md §Anniversaires). Contourne
   * volontairement PermissionsGuard — même raison que findMe/EventsService.
   * findMineInClub : un Coach peut avoir plusieurs équipes, une route sans
   * teamId dans l'URL ne pourrait jamais matcher un scope TEAM via le moteur
   * RBAC générique (voir docs/modules/auth-roles.md §Patterns découverts).
   *
   * Scope CLUB/ALL (AdminClub/SuperAdmin) : tous les membres du club.
   * Scope TEAM (Coach/Player/Parent) : union de deux chemins d'appartenance
   * distincts — (a) staff avec un MemberRole actif sur une équipe accessible
   * (rôle RBAC scopé équipe) et (b) joueurs avec un PlayerTeam actif
   * (leaveDate null) sur une équipe accessible (rattachement effectif, pas
   * un rôle RBAC) — un Coach doit voir les anniversaires de ses joueurs ET
   * de son co-encadrement, pas seulement l'un des deux chemins.
   *
   * Ne renvoie jamais `birthDate` brut : seulement l'occurrence concrète
   * dans la fenêtre demandée et l'âge qui en découle, jamais l'année de
   * naissance d'un membre que l'appelant ne pourrait pas voir autrement.
   */
  async findBirthdaysInClub(
    clubId: number,
    userId: number,
    range: { dateFrom: Date; dateTo: Date },
    teamIds?: number[],
  ): Promise<MemberBirthday[]> {
    const member = await this.findByUserAndClub(userId, clubId);
    if (!member) {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }

    const clubWideScope = await this.permissionsService.can(
      member.id,
      'READ',
      'member',
      { clubId },
    );

    let members: {
      id: number;
      firstName: string;
      lastName: string;
      birthDate: Date | null;
    }[];

    if (clubWideScope) {
      members = await this.prisma.member.findMany({
        where: { clubId, birthDate: { not: null } },
        select: { id: true, firstName: true, lastName: true, birthDate: true },
      });
    } else {
      const accessibleTeams = await this.prisma.team.findMany({
        where: {
          clubId,
          memberRoles: { some: { memberId: member.id, teamId: { not: null } } },
        },
        select: { id: true },
      });
      const accessibleTeamIds = teamIds?.length
        ? accessibleTeams.map((t) => t.id).filter((id) => teamIds.includes(id))
        : accessibleTeams.map((t) => t.id);

      members = accessibleTeamIds.length
        ? await this.prisma.member.findMany({
            where: {
              clubId,
              birthDate: { not: null },
              OR: [
                {
                  memberRoles: { some: { teamId: { in: accessibleTeamIds } } },
                },
                {
                  playerProfile: {
                    playerTeams: {
                      some: {
                        teamId: { in: accessibleTeamIds },
                        leaveDate: null,
                      },
                    },
                  },
                },
              ],
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              birthDate: true,
            },
          })
        : [];
    }

    const birthdays: MemberBirthday[] = [];
    for (const m of members) {
      if (!m.birthDate) continue;
      for (const date of computeYearlyOccurrences(
        m.birthDate,
        range.dateFrom,
        range.dateTo,
      )) {
        birthdays.push({
          memberId: m.id,
          firstName: m.firstName,
          lastName: m.lastName,
          date,
          age: date.getFullYear() - m.birthDate.getUTCFullYear(),
        });
      }
    }
    return birthdays.sort((a, b) => a.date.getTime() - b.date.getTime());
  }
}
