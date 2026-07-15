import { HttpStatus, Injectable } from '@nestjs/common';
import type { Gender, PermissionScope } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { assertParentChildLink } from '../common/parent-child-membership';
import { computeYearlyOccurrences } from '../common/yearly-occurrence';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';

export interface MemberRequestContext {
  memberId: number;
  scope: PermissionScope;
}

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
    requester: MemberRequestContext,
  ) {
    const member = await this.prisma.member.findFirst({
      where: { id, clubId },
    });
    if (!member) {
      throw new AppException('MEMBERS.NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    // Seul le scope PARENT est vérifié finement ici : contrairement à
    // TEAM/CLUB/ALL (gap pré-existant toléré, PermissionsGuard seul filtre
    // via le teamId en query — docs/modules/auth-roles.md), un Parent non
    // lié ne doit jamais pouvoir éditer un membre arbitraire de l'équipe.
    if (requester.scope === 'PARENT' && member.id !== requester.memberId) {
      await assertParentChildLink(
        this.prisma,
        requester.memberId,
        member.id,
        'MEMBERS.NOT_FOUND',
      );
    }

    return this.prisma.member.update({ where: { id }, data });
  }

  /**
   * Suppression RGPD en cascade (docs/decisions-ouvertes-et-rgpd.md,
   * docs/modules/effectif-joueurs.md) : supprime le Member de CE club et
   * toutes ses données scopées club (jamais le User — identifiants de
   * connexion partagés entre clubs, voir la règle du plan).
   *
   * Flux en deux temps pour un membre du STAFF référencé comme auteur/
   * évaluateur/référent sur les données d'AUTRES joueurs (notes,
   * évaluations, entretiens, absences, objectifs) :
   * 1. Par défaut, bloqué (409 MEMBERS.REFERENCED_ELSEWHERE, détail des
   *    compteurs) — archiver est le chemin recommandé dans l'immense
   *    majorité des cas.
   * 2. Si `forceAnonymize` est explicitement transmis, ces références sont
   *    anonymisées (champ auteur mis à `null`) plutôt que de bloquer — le
   *    membre du STAFF a le droit de faire disparaître complètement ses
   *    données en cas de conflit.
   *
   * Les données dont CE membre est lui-même le SUJET (ses propres notes,
   * évaluations, absences...) sont toujours supprimées, jamais anonymisées
   * — l'auto-référencement (ce membre auteur d'une donnée sur lui-même) est
   * donc exclu du comptage ci-dessus, il disparaît de toute façon avec le
   * reste de ses données.
   */
  async remove(
    clubId: number,
    id: number,
    options: { forceAnonymize?: boolean } = {},
  ) {
    const member = await this.prisma.member.findFirst({
      where: { id, clubId },
      include: { playerProfile: true },
    });
    if (!member) {
      throw new AppException('MEMBERS.NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    const referenced = await this.countReferencedElsewhere(id);
    if (referenced.total > 0 && !options.forceAnonymize) {
      throw new AppException(
        'MEMBERS.REFERENCED_ELSEWHERE',
        HttpStatus.CONFLICT,
        referenced,
      );
    }

    const playerId = member.playerProfile?.id;

    await this.prisma.$transaction(async (tx) => {
      if (referenced.total > 0) {
        const notInSelf = { player: { memberId: { not: id } } };
        await tx.playerNote.updateMany({
          where: { authorId: id, ...notInSelf },
          data: { authorId: null },
        });
        await tx.playerEvaluation.updateMany({
          where: { evaluatorId: id, ...notInSelf },
          data: { evaluatorId: null },
        });
        await tx.playerInterview.updateMany({
          where: { staffId: id, ...notInSelf },
          data: { staffId: null },
        });
        await tx.playerAbsence.updateMany({
          where: { reportedById: id, ...notInSelf },
          data: { reportedById: null },
        });
        await tx.playerObjective.updateMany({
          where: { assignedById: id, ...notInSelf },
          data: { assignedById: null },
        });
      }

      // Ordre imposé par les contraintes FK : tout ce qui référence
      // PlayerProfile/Member doit disparaître avant eux. PlayerEvaluationScore
      // n'a pas besoin d'une suppression explicite (onDelete: Cascade via
      // PlayerEvaluation, voir schema.prisma).
      if (playerId) {
        await tx.playerEvaluation.deleteMany({ where: { playerId } });
        await tx.playerMeasurement.deleteMany({ where: { playerId } });
        await tx.playerNote.deleteMany({ where: { playerId } });
        await tx.playerObjective.deleteMany({ where: { playerId } });
        await tx.playerInterview.deleteMany({ where: { playerId } });
        await tx.playerAbsence.deleteMany({ where: { playerId } });
        await tx.playerTeam.deleteMany({ where: { playerId } });
      }
      await tx.teamStaff.deleteMany({ where: { memberId: id } });
      await tx.memberRole.deleteMany({ where: { memberId: id } });
      if (playerId) {
        await tx.playerProfile.delete({ where: { id: playerId } });
      }
      await tx.member.delete({ where: { id } });
    });
  }

  private async countReferencedElsewhere(memberId: number) {
    const notInSelf = { memberId: { not: memberId } };
    const [notes, evaluations, interviews, absences, objectives] =
      await Promise.all([
        this.prisma.playerNote.count({
          where: { authorId: memberId, player: notInSelf },
        }),
        this.prisma.playerEvaluation.count({
          where: { evaluatorId: memberId, player: notInSelf },
        }),
        this.prisma.playerInterview.count({
          where: { staffId: memberId, player: notInSelf },
        }),
        this.prisma.playerAbsence.count({
          where: { reportedById: memberId, player: notInSelf },
        }),
        this.prisma.playerObjective.count({
          where: { assignedById: memberId, player: notInSelf },
        }),
      ]);
    return {
      notes,
      evaluations,
      interviews,
      absences,
      objectives,
      total: notes + evaluations + interviews + absences + objectives,
    };
  }

  findByUserAndClub(userId: number, clubId: number) {
    return this.prisma.member.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
  }

  /**
   * Résout le Member de l'appelant pour ce club, ou le provisionne à la
   * volée s'il n'existe pas encore ET que l'appelant détient un rôle
   * plateforme actif (UserRole — SuperAdmin/Proprietaire, docs/modules/
   * auth-roles.md §Rôles plateforme). Ne vérifie PAS de permission fine :
   * même contrat que findMe/updateMe (résolution d'identité uniquement),
   * la RBAC fine reste évaluée séparément (canEffective) par l'appelant.
   *
   * `upsert` (pas `create`) : deux requêtes concurrentes du même
   * utilisateur plateforme sur le même club ne doivent jamais se percuter
   * sur la contrainte unique (userId, clubId).
   *
   * Fiche provisionnée avec un nom placeholder (User n'a aucun champ nom) —
   * trivialement corrigible ensuite via PATCH /clubs/:clubId/members/:id.
   */
  async resolveOrProvisionMember(userId: number, clubId: number) {
    const existing = await this.findByUserAndClub(userId, clubId);
    if (existing) {
      return existing;
    }

    if (!(await this.permissionsService.hasActivePlatformRole(userId))) {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const [localPart] = (user?.email ?? 'compte').split('@');

    return this.prisma.member.upsert({
      where: { userId_clubId: { userId, clubId } },
      update: {},
      create: {
        userId,
        clubId,
        firstName: localPart,
        lastName: '(compte plateforme)',
      },
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
    return this.resolveOrProvisionMember(userId, clubId);
  }

  async updateMe(
    clubId: number,
    userId: number,
    data: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      birthDate?: Date;
    },
  ) {
    const member = await this.resolveOrProvisionMember(userId, clubId);
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
    const member = await this.resolveOrProvisionMember(userId, clubId);

    const clubWideScope = await this.permissionsService.canEffective(
      userId,
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
