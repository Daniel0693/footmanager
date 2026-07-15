import type { Member } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { MembersService } from './members.service';

// Stub par défaut : seule findBirthdaysInClub appelle canEffective(), les
// autres tests n'ont pas besoin d'un comportement spécifique ici.
// hasActivePlatformRole résout `false` par défaut (pas de rôle plateforme) :
// resolveOrProvisionMember (findMe/updateMe/findBirthdaysInClub) doit
// rejeter en AUTH.FORBIDDEN quand aucun Member n'existe, comme avant.
const permissionsServiceStub = {
  can: jest.fn(),
  canEffective: jest.fn(),
  hasActivePlatformRole: jest.fn().mockResolvedValue(false),
} as unknown as PermissionsService;

const member: Member = {
  id: 1,
  userId: null,
  clubId: 1,
  firstName: 'Tom',
  lastName: 'Joueur',
  phone: null,
  avatarUrl: null,
  gender: null,
  birthDate: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('MembersService', () => {
  describe('create', () => {
    it('crée un membre sans userId (membre sans compte)', async () => {
      const create = jest.fn().mockResolvedValue(member);
      const prismaStub = { member: { create } } as unknown as PrismaService;
      const service = new MembersService(prismaStub, permissionsServiceStub);

      const result = await service.create({
        clubId: 1,
        firstName: 'Tom',
        lastName: 'Joueur',
      });

      expect(result).toBe(member);
      expect(create).toHaveBeenCalledWith({
        data: { clubId: 1, firstName: 'Tom', lastName: 'Joueur' },
      });
    });

    it('crée un membre avec userId quand fourni (ex. création de club)', async () => {
      const create = jest.fn().mockResolvedValue({ ...member, userId: 7 });
      const prismaStub = { member: { create } } as unknown as PrismaService;
      const service = new MembersService(prismaStub, permissionsServiceStub);

      await service.create({
        userId: 7,
        clubId: 1,
        firstName: 'Alice',
        lastName: 'Admin',
      });

      expect(create).toHaveBeenCalledWith({
        data: { userId: 7, clubId: 1, firstName: 'Alice', lastName: 'Admin' },
      });
    });

    it('crée un membre avec un genre renseigné', async () => {
      const create = jest.fn().mockResolvedValue({ ...member, gender: 'MALE' });
      const prismaStub = { member: { create } } as unknown as PrismaService;
      const service = new MembersService(prismaStub, permissionsServiceStub);

      await service.create({
        clubId: 1,
        firstName: 'Tom',
        lastName: 'Joueur',
        gender: 'MALE',
      });

      expect(create).toHaveBeenCalledWith({
        data: {
          clubId: 1,
          firstName: 'Tom',
          lastName: 'Joueur',
          gender: 'MALE',
        },
      });
    });

    it('crée un membre avec une date de naissance renseignée', async () => {
      const birthDate = new Date('1998-05-12');
      const create = jest.fn().mockResolvedValue({ ...member, birthDate });
      const prismaStub = { member: { create } } as unknown as PrismaService;
      const service = new MembersService(prismaStub, permissionsServiceStub);

      await service.create({
        clubId: 1,
        firstName: 'Tom',
        lastName: 'Joueur',
        birthDate,
      });

      expect(create).toHaveBeenCalledWith({
        data: { clubId: 1, firstName: 'Tom', lastName: 'Joueur', birthDate },
      });
    });
  });

  describe('update', () => {
    it('met à jour un membre existant du club', async () => {
      const findFirst = jest.fn().mockResolvedValue(member);
      const update = jest
        .fn()
        .mockResolvedValue({ ...member, firstName: 'Thomas' });
      const prismaStub = {
        member: { findFirst, update },
      } as unknown as PrismaService;
      const service = new MembersService(prismaStub, permissionsServiceStub);

      const result = await service.update(1, 1, { firstName: 'Thomas' });

      expect(findFirst).toHaveBeenCalledWith({ where: { id: 1, clubId: 1 } });
      expect(update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { firstName: 'Thomas' },
      });
      expect(result.firstName).toBe('Thomas');
    });

    it('met à jour la date de naissance', async () => {
      const birthDate = new Date('1990-01-20');
      const findFirst = jest.fn().mockResolvedValue(member);
      const update = jest.fn().mockResolvedValue({ ...member, birthDate });
      const prismaStub = {
        member: { findFirst, update },
      } as unknown as PrismaService;
      const service = new MembersService(prismaStub, permissionsServiceStub);

      await service.update(1, 1, { birthDate });

      expect(update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { birthDate },
      });
    });

    it("rejette la mise à jour d'un membre absent du club (pas de fuite inter-club)", async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const prismaStub = {
        member: { findFirst, update: jest.fn() },
      } as unknown as PrismaService;
      const service = new MembersService(prismaStub, permissionsServiceStub);

      await expect(
        service.update(2, 1, { firstName: 'Thomas' }),
      ).rejects.toBeInstanceOf(AppException);
    });
  });

  describe('remove — suppression RGPD en cascade', () => {
    const memberWithoutProfile = { ...member, id: 7, playerProfile: null };
    const memberWithProfile = {
      ...member,
      id: 42,
      playerProfile: { id: 100, memberId: 42 },
    };

    function buildPrismaStub(overrides: Record<string, unknown> = {}) {
      const tx = {
        playerNote: { updateMany: jest.fn(), deleteMany: jest.fn() },
        playerEvaluation: { updateMany: jest.fn(), deleteMany: jest.fn() },
        playerInterview: { updateMany: jest.fn(), deleteMany: jest.fn() },
        playerAbsence: { updateMany: jest.fn(), deleteMany: jest.fn() },
        playerObjective: { updateMany: jest.fn(), deleteMany: jest.fn() },
        playerMeasurement: { deleteMany: jest.fn() },
        playerTeam: { deleteMany: jest.fn() },
        teamStaff: { deleteMany: jest.fn() },
        memberRole: { deleteMany: jest.fn() },
        playerProfile: { delete: jest.fn() },
        member: { delete: jest.fn() },
      };
      const counts = {
        playerNote: jest.fn().mockResolvedValue(0),
        playerEvaluation: jest.fn().mockResolvedValue(0),
        playerInterview: jest.fn().mockResolvedValue(0),
        playerAbsence: jest.fn().mockResolvedValue(0),
        playerObjective: jest.fn().mockResolvedValue(0),
      };
      const prismaStub = {
        member: { findFirst: jest.fn(), delete: jest.fn() },
        playerNote: { count: counts.playerNote },
        playerEvaluation: { count: counts.playerEvaluation },
        playerInterview: { count: counts.playerInterview },
        playerAbsence: { count: counts.playerAbsence },
        playerObjective: { count: counts.playerObjective },
        $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
          callback(tx),
        ),
        ...overrides,
      } as unknown as PrismaService;
      return { prismaStub, tx, counts };
    }

    it("renvoie 404 si le membre n'appartient pas au club", async () => {
      const { prismaStub } = buildPrismaStub({
        member: { findFirst: jest.fn().mockResolvedValue(null) },
      });
      const service = new MembersService(prismaStub, permissionsServiceStub);

      await expect(service.remove(1, 999)).rejects.toMatchObject({
        status: 404,
      });
    });

    it("bloque (409) si le membre est référencé comme auteur sur d'AUTRES joueurs, sans forceAnonymize", async () => {
      const { prismaStub, tx } = buildPrismaStub({
        member: { findFirst: jest.fn().mockResolvedValue(memberWithProfile) },
        playerNote: { count: jest.fn().mockResolvedValue(3) },
      });
      const service = new MembersService(prismaStub, permissionsServiceStub);

      await expect(service.remove(1, 42)).rejects.toMatchObject({
        status: 409,
        response: {
          code: 'MEMBERS.REFERENCED_ELSEWHERE',
          details: { notes: 3, total: 3 },
        },
      });
      expect(tx.member.delete).not.toHaveBeenCalled();
    });

    it('exclut les notes/évaluations sur SOI-MÊME du comptage (auto-référencement)', async () => {
      const { prismaStub, counts } = buildPrismaStub({
        member: { findFirst: jest.fn().mockResolvedValue(memberWithProfile) },
      });
      const service = new MembersService(prismaStub, permissionsServiceStub);

      await service.remove(1, 42);

      expect(counts.playerNote).toHaveBeenCalledWith({
        where: { authorId: 42, player: { memberId: { not: 42 } } },
      });
    });

    it('supprime le membre et toutes ses données (profil joueur inclus) quand rien ne bloque', async () => {
      const { prismaStub, tx } = buildPrismaStub({
        member: { findFirst: jest.fn().mockResolvedValue(memberWithProfile) },
      });
      const service = new MembersService(prismaStub, permissionsServiceStub);

      await service.remove(1, 42);

      expect(tx.playerEvaluation.deleteMany).toHaveBeenCalledWith({
        where: { playerId: 100 },
      });
      expect(tx.playerMeasurement.deleteMany).toHaveBeenCalledWith({
        where: { playerId: 100 },
      });
      expect(tx.playerNote.deleteMany).toHaveBeenCalledWith({
        where: { playerId: 100 },
      });
      expect(tx.playerObjective.deleteMany).toHaveBeenCalledWith({
        where: { playerId: 100 },
      });
      expect(tx.playerInterview.deleteMany).toHaveBeenCalledWith({
        where: { playerId: 100 },
      });
      expect(tx.playerAbsence.deleteMany).toHaveBeenCalledWith({
        where: { playerId: 100 },
      });
      expect(tx.playerTeam.deleteMany).toHaveBeenCalledWith({
        where: { playerId: 100 },
      });
      expect(tx.teamStaff.deleteMany).toHaveBeenCalledWith({
        where: { memberId: 42 },
      });
      expect(tx.memberRole.deleteMany).toHaveBeenCalledWith({
        where: { memberId: 42 },
      });
      expect(tx.playerProfile.delete).toHaveBeenCalledWith({
        where: { id: 100 },
      });
      expect(tx.member.delete).toHaveBeenCalledWith({ where: { id: 42 } });
      // Aucune anonymisation quand rien ne bloquait : pas d'auteur à préserver.
      expect(tx.playerNote.updateMany).not.toHaveBeenCalled();
    });

    it("supprime un membre du STAFF sans profil joueur (n'appelle aucun deleteMany scopé playerId)", async () => {
      const { prismaStub, tx } = buildPrismaStub({
        member: {
          findFirst: jest.fn().mockResolvedValue(memberWithoutProfile),
        },
      });
      const service = new MembersService(prismaStub, permissionsServiceStub);

      await service.remove(1, 7);

      expect(tx.playerTeam.deleteMany).not.toHaveBeenCalled();
      expect(tx.playerProfile.delete).not.toHaveBeenCalled();
      expect(tx.teamStaff.deleteMany).toHaveBeenCalledWith({
        where: { memberId: 7 },
      });
      expect(tx.member.delete).toHaveBeenCalledWith({ where: { id: 7 } });
    });

    it('anonymise (authorId/evaluatorId/... = null) les références sur AUTRES joueurs quand forceAnonymize=true, puis supprime le membre', async () => {
      const { prismaStub, tx } = buildPrismaStub({
        member: { findFirst: jest.fn().mockResolvedValue(memberWithProfile) },
        playerNote: { count: jest.fn().mockResolvedValue(2) },
        playerEvaluation: { count: jest.fn().mockResolvedValue(1) },
      });
      const service = new MembersService(prismaStub, permissionsServiceStub);

      await service.remove(1, 42, { forceAnonymize: true });

      expect(tx.playerNote.updateMany).toHaveBeenCalledWith({
        where: { authorId: 42, player: { memberId: { not: 42 } } },
        data: { authorId: null },
      });
      expect(tx.playerEvaluation.updateMany).toHaveBeenCalledWith({
        where: { evaluatorId: 42, player: { memberId: { not: 42 } } },
        data: { evaluatorId: null },
      });
      expect(tx.member.delete).toHaveBeenCalledWith({ where: { id: 42 } });
    });
  });

  describe('findMe / updateMe ("Mon profil")', () => {
    it("renvoie le Member de l'utilisateur courant pour ce club", async () => {
      const findUnique = jest.fn().mockResolvedValue(member);
      const prismaStub = {
        member: { findUnique },
      } as unknown as PrismaService;
      const service = new MembersService(prismaStub, permissionsServiceStub);

      const result = await service.findMe(1, 7);

      expect(findUnique).toHaveBeenCalledWith({
        where: { userId_clubId: { userId: 7, clubId: 1 } },
      });
      expect(result).toBe(member);
    });

    it("rejette findMe si l'utilisateur n'a pas de fiche membre dans ce club", async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const prismaStub = {
        member: { findUnique },
      } as unknown as PrismaService;
      const service = new MembersService(prismaStub, permissionsServiceStub);

      await expect(service.findMe(1, 999)).rejects.toBeInstanceOf(AppException);
    });

    it('met à jour la date de naissance du membre courant', async () => {
      const birthDate = new Date('1985-03-02');
      const findUnique = jest.fn().mockResolvedValue(member);
      const update = jest.fn().mockResolvedValue({ ...member, birthDate });
      const prismaStub = {
        member: { findUnique, update },
      } as unknown as PrismaService;
      const service = new MembersService(prismaStub, permissionsServiceStub);

      await service.updateMe(1, 7, { birthDate });

      expect(update).toHaveBeenCalledWith({
        where: { id: member.id },
        data: { birthDate },
      });
    });

    it("rejette updateMe si l'utilisateur n'a pas de fiche membre dans ce club", async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const update = jest.fn();
      const prismaStub = {
        member: { findUnique, update },
      } as unknown as PrismaService;
      const service = new MembersService(prismaStub, permissionsServiceStub);

      await expect(
        service.updateMe(1, 999, { birthDate: new Date() }),
      ).rejects.toBeInstanceOf(AppException);
      expect(update).not.toHaveBeenCalled();
    });

    it("n'autorise pas la mise à jour du Member d'un autre club (userId+clubId ne matchent pas)", async () => {
      // findByUserAndClub filtre déjà par userId_clubId : un utilisateur du
      // club 2 n'a pas de Member pour le club 1, donc pas de fuite possible.
      const findUnique = jest.fn().mockResolvedValue(null);
      const prismaStub = {
        member: { findUnique, update: jest.fn() },
      } as unknown as PrismaService;
      const service = new MembersService(prismaStub, permissionsServiceStub);

      await expect(
        service.updateMe(1, 7, { birthDate: new Date() }),
      ).rejects.toBeInstanceOf(AppException);
      expect(findUnique).toHaveBeenCalledWith({
        where: { userId_clubId: { userId: 7, clubId: 1 } },
      });
    });
  });

  describe('findBirthdaysInClub', () => {
    const caller: Member = { ...member, id: 42, userId: 7 };

    it("renvoie 403 si l'appelant n'a pas de fiche membre dans ce club", async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const prismaStub = { member: { findUnique } } as unknown as PrismaService;
      const service = new MembersService(prismaStub, permissionsServiceStub);

      await expect(
        service.findBirthdaysInClub(1, 999, {
          dateFrom: new Date(2026, 0, 1),
          dateTo: new Date(2026, 11, 31),
        }),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('scope CLUB/ALL : tous les membres du club avec une date de naissance', async () => {
      const findUnique = jest.fn().mockResolvedValue(caller);
      const findMany = jest.fn().mockResolvedValue([
        {
          id: 1,
          firstName: 'Tom',
          lastName: 'Joueur',
          birthDate: new Date('2010-07-08'),
        },
      ]);
      const prismaStub = {
        member: { findUnique, findMany },
      } as unknown as PrismaService;
      const canEffective = jest.fn().mockResolvedValue('CLUB');
      const permissionsStub = { canEffective } as unknown as PermissionsService;
      const service = new MembersService(prismaStub, permissionsStub);

      const result = await service.findBirthdaysInClub(1, 7, {
        dateFrom: new Date(2026, 0, 1),
        dateTo: new Date(2026, 11, 31),
      });

      expect(canEffective).toHaveBeenCalledWith(7, 42, 'READ', 'member', {
        clubId: 1,
      });
      expect(findMany).toHaveBeenCalledWith({
        where: { clubId: 1, birthDate: { not: null } },
        select: { id: true, firstName: true, lastName: true, birthDate: true },
      });
      expect(result).toEqual([
        {
          memberId: 1,
          firstName: 'Tom',
          lastName: 'Joueur',
          date: new Date(2026, 6, 8),
          age: 16,
        },
      ]);
    });

    it('scope TEAM : union des membres du staff (MemberRole) et des joueurs (PlayerTeam actif)', async () => {
      const findUnique = jest.fn().mockResolvedValue(caller);
      const teamFindMany = jest.fn().mockResolvedValue([{ id: 5 }]);
      const memberFindMany = jest.fn().mockResolvedValue([]);
      const prismaStub = {
        member: { findUnique, findMany: memberFindMany },
        team: { findMany: teamFindMany },
      } as unknown as PrismaService;
      const canEffective = jest.fn().mockResolvedValue(null);
      const permissionsStub = { canEffective } as unknown as PermissionsService;
      const service = new MembersService(prismaStub, permissionsStub);

      await service.findBirthdaysInClub(1, 7, {
        dateFrom: new Date(2026, 0, 1),
        dateTo: new Date(2026, 11, 31),
      });

      expect(teamFindMany).toHaveBeenCalledWith({
        where: {
          clubId: 1,
          memberRoles: { some: { memberId: 42, teamId: { not: null } } },
        },
        select: { id: true },
      });
      expect(memberFindMany).toHaveBeenCalledWith({
        where: {
          clubId: 1,
          birthDate: { not: null },
          OR: [
            { memberRoles: { some: { teamId: { in: [5] } } } },
            {
              playerProfile: {
                playerTeams: { some: { teamId: { in: [5] }, leaveDate: null } },
              },
            },
          ],
        },
        select: { id: true, firstName: true, lastName: true, birthDate: true },
      });
    });

    it('scope TEAM : le filtre teamIds restreint encore les équipes accessibles', async () => {
      const findUnique = jest.fn().mockResolvedValue(caller);
      const teamFindMany = jest.fn().mockResolvedValue([{ id: 5 }, { id: 8 }]);
      const memberFindMany = jest.fn().mockResolvedValue([]);
      const prismaStub = {
        member: { findUnique, findMany: memberFindMany },
        team: { findMany: teamFindMany },
      } as unknown as PrismaService;
      const canEffective = jest.fn().mockResolvedValue(null);
      const permissionsStub = { canEffective } as unknown as PermissionsService;
      const service = new MembersService(prismaStub, permissionsStub);

      await service.findBirthdaysInClub(
        1,
        7,
        { dateFrom: new Date(2026, 0, 1), dateTo: new Date(2026, 11, 31) },
        [8],
      );

      expect(memberFindMany).toHaveBeenCalledWith({
        where: {
          clubId: 1,
          birthDate: { not: null },
          OR: [
            { memberRoles: { some: { teamId: { in: [8] } } } },
            {
              playerProfile: {
                playerTeams: {
                  some: { teamId: { in: [8] }, leaveDate: null },
                },
              },
            },
          ],
        },
        select: { id: true, firstName: true, lastName: true, birthDate: true },
      });
    });

    it('scope TEAM sans équipe accessible : liste vide, aucune requête sur Member', async () => {
      const findUnique = jest.fn().mockResolvedValue(caller);
      const teamFindMany = jest.fn().mockResolvedValue([]);
      const memberFindMany = jest.fn();
      const prismaStub = {
        member: { findUnique, findMany: memberFindMany },
        team: { findMany: teamFindMany },
      } as unknown as PrismaService;
      const canEffective = jest.fn().mockResolvedValue(null);
      const permissionsStub = { canEffective } as unknown as PermissionsService;
      const service = new MembersService(prismaStub, permissionsStub);

      const result = await service.findBirthdaysInClub(1, 7, {
        dateFrom: new Date(2026, 0, 1),
        dateTo: new Date(2026, 11, 31),
      });

      expect(result).toEqual([]);
      expect(memberFindMany).not.toHaveBeenCalled();
    });

    it('trie les anniversaires par date et ignore les membres sans date de naissance', async () => {
      const findUnique = jest.fn().mockResolvedValue(caller);
      const findMany = jest.fn().mockResolvedValue([
        {
          id: 1,
          firstName: 'Zoé',
          lastName: 'A',
          birthDate: new Date('2010-12-20'),
        },
        {
          id: 2,
          firstName: 'Aya',
          lastName: 'B',
          birthDate: new Date('2010-01-05'),
        },
        { id: 3, firstName: 'Sans', lastName: 'Date', birthDate: null },
      ]);
      const prismaStub = {
        member: { findUnique, findMany },
      } as unknown as PrismaService;
      const canEffective = jest.fn().mockResolvedValue('CLUB');
      const permissionsStub = { canEffective } as unknown as PermissionsService;
      const service = new MembersService(prismaStub, permissionsStub);

      const result = await service.findBirthdaysInClub(1, 7, {
        dateFrom: new Date(2026, 0, 1),
        dateTo: new Date(2026, 11, 31),
      });

      expect(result.map((b) => b.memberId)).toEqual([2, 1]);
    });
  });
});
