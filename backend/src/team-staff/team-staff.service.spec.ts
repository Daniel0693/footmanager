import { HttpStatus } from '@nestjs/common';
import type { Member, Role, Team, TeamStaff } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TeamStaffService } from './team-staff.service';

const team: Team = {
  id: 5,
  clubId: 1,
  name: 'U15 A',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const member: Member = {
  id: 42,
  userId: 7,
  clubId: 1,
  firstName: 'Marc',
  lastName: 'Dupont',
  phone: null,
  avatarUrl: null,
  gender: null,
  birthDate: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const coachRole: Role = {
  id: 6,
  name: 'Coach',
  description: null,
  isSystem: true,
  clubId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const principalAssignment: TeamStaff = {
  id: 300,
  teamId: 5,
  memberId: 1, // le Principal, pas Marc
  staffRole: 'PRINCIPAL',
  startDate: null,
  endDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const adjointAssignment: TeamStaff = {
  id: 301,
  teamId: 5,
  memberId: 42, // Marc, Adjoint
  staffRole: 'ADJOINT',
  startDate: null,
  endDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const activeCoachMemberRole = {
  id: 900,
  memberId: 42,
  roleId: 6,
  clubId: 1,
  teamId: 5,
  startDate: null,
  endDate: null,
};

// Requester scope CLUB (AdminClub) : neutre vis-à-vis des nouvelles règles
// (assertCanCreateStaff/assertCanAssignPrincipal ne s'appliquent qu'au scope
// TEAM) — utilisé pour les tests qui ne portent pas sur ces règles.
const adminRequester = { memberId: 99, scope: 'CLUB' as const };

describe('TeamStaffService', () => {
  let teamFindFirst: jest.Mock;
  let memberFindFirst: jest.Mock;
  let tsFindFirst: jest.Mock;
  let tsFindMany: jest.Mock;
  let tx: {
    teamStaff: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    member: { create: jest.Mock };
    role: { findFirst: jest.Mock };
    memberRole: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  };
  let transaction: jest.Mock;
  let service: TeamStaffService;

  beforeEach(() => {
    teamFindFirst = jest.fn();
    memberFindFirst = jest.fn();
    tsFindFirst = jest.fn();
    tsFindMany = jest.fn();

    tx = {
      teamStaff: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      member: { create: jest.fn() },
      role: { findFirst: jest.fn().mockResolvedValue(coachRole) },
      memberRole: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    };
    transaction = jest.fn((callback: (tx: unknown) => unknown) => callback(tx));

    const prismaStub = {
      team: { findFirst: teamFindFirst },
      member: { findFirst: memberFindFirst },
      teamStaff: {
        findFirst: tsFindFirst,
        findMany: tsFindMany,
      },
      $transaction: transaction,
    } as unknown as PrismaService;

    service = new TeamStaffService(prismaStub);
  });

  describe('create', () => {
    it("refuse si l'équipe n'appartient pas au club", async () => {
      teamFindFirst.mockResolvedValue(null);

      await expect(
        service.create(
          1,
          5,
          { memberId: 42, staffRole: 'ADJOINT' },
          adminRequester,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(transaction).not.toHaveBeenCalled();
    });

    it("refuse si le membre n'appartient pas au club", async () => {
      teamFindFirst.mockResolvedValue(team);
      memberFindFirst.mockResolvedValue(null);

      await expect(
        service.create(
          1,
          5,
          { memberId: 42, staffRole: 'ADJOINT' },
          adminRequester,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(transaction).not.toHaveBeenCalled();
    });

    it('refuse si le membre a déjà une affectation active dans le staff de cette équipe', async () => {
      teamFindFirst.mockResolvedValue(team);
      memberFindFirst.mockResolvedValue(member);
      tx.teamStaff.findFirst.mockResolvedValue(adjointAssignment);

      await expect(
        service.create(
          1,
          5,
          { memberId: 42, staffRole: 'CO_ENTRAINEUR' },
          adminRequester,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
      expect(tx.teamStaff.create).not.toHaveBeenCalled();
    });

    it('crée l’affectation et le MemberRole Coach correspondant quand toutes les vérifications passent', async () => {
      teamFindFirst.mockResolvedValue(team);
      memberFindFirst.mockResolvedValue(member);
      tx.teamStaff.findFirst.mockResolvedValue(null);
      tx.teamStaff.create.mockResolvedValue(adjointAssignment);

      const result = await service.create(
        1,
        5,
        { memberId: 42, staffRole: 'ADJOINT' },
        adminRequester,
      );

      expect(result).toBe(adjointAssignment);
      expect(tx.teamStaff.create).toHaveBeenCalledWith({
        data: {
          memberId: 42,
          teamId: 5,
          staffRole: 'ADJOINT',
          startDate: undefined,
        },
      });
      expect(tx.memberRole.create).toHaveBeenCalledWith({
        data: {
          memberId: 42,
          roleId: 6,
          clubId: 1,
          teamId: 5,
          startDate: undefined,
        },
      });
    });

    it('refuse si le rôle système Coach est introuvable (garde-fou)', async () => {
      teamFindFirst.mockResolvedValue(team);
      memberFindFirst.mockResolvedValue(member);
      tx.teamStaff.findFirst.mockResolvedValue(null);
      tx.teamStaff.create.mockResolvedValue(adjointAssignment);
      tx.role.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          1,
          5,
          { memberId: 42, staffRole: 'ADJOINT' },
          adminRequester,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.INTERNAL_SERVER_ERROR });
      expect(tx.memberRole.create).not.toHaveBeenCalled();
    });

    describe('création d’une nouvelle personne (pas de memberId)', () => {
      it('refuse si ni memberId ni prénom/nom ne sont fournis', async () => {
        teamFindFirst.mockResolvedValue(team);

        await expect(
          service.create(1, 5, { staffRole: 'ADJOINT' }, adminRequester),
        ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
        expect(transaction).not.toHaveBeenCalled();
        expect(memberFindFirst).not.toHaveBeenCalled();
      });

      it('crée le Member puis l’affectation et le MemberRole quand prénom/nom sont fournis sans memberId', async () => {
        teamFindFirst.mockResolvedValue(team);
        tx.member.create.mockResolvedValue({ id: 55 });
        tx.teamStaff.findFirst.mockResolvedValue(null);
        tx.teamStaff.create.mockResolvedValue({
          ...adjointAssignment,
          memberId: 55,
        });

        const result = await service.create(
          1,
          5,
          {
            firstName: 'Nadia',
            lastName: 'Roux',
            phone: '0601020304',
            staffRole: 'ADJOINT',
          },
          adminRequester,
        );

        expect(memberFindFirst).not.toHaveBeenCalled();
        expect(tx.member.create).toHaveBeenCalledWith({
          data: {
            clubId: 1,
            firstName: 'Nadia',
            lastName: 'Roux',
            phone: '0601020304',
            gender: undefined,
            birthDate: undefined,
          },
        });
        expect(tx.teamStaff.create).toHaveBeenCalledWith({
          data: {
            memberId: 55,
            teamId: 5,
            staffRole: 'ADJOINT',
            startDate: undefined,
          },
        });
        expect(tx.memberRole.create).toHaveBeenCalledWith({
          data: {
            memberId: 55,
            roleId: 6,
            clubId: 1,
            teamId: 5,
            startDate: undefined,
          },
        });
        expect(result).toMatchObject({ memberId: 55 });
      });
    });

    describe('règle — seul le Principal (ou un scope CLUB/ALL) peut créer une affectation', () => {
      it("refuse un scope TEAM qui n'est pas Principal de cette équipe", async () => {
        teamFindFirst.mockResolvedValue(team);
        memberFindFirst.mockResolvedValue(member);
        tsFindFirst.mockResolvedValue(adjointAssignment); // requester = Adjoint

        await expect(
          service.create(
            1,
            5,
            { memberId: 77, staffRole: 'ADJOINT' },
            { memberId: 42, scope: 'TEAM' },
          ),
        ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
        expect(transaction).not.toHaveBeenCalled();
      });

      it("refuse un scope TEAM sans aucune affectation active (n'est même plus du staff)", async () => {
        teamFindFirst.mockResolvedValue(team);
        memberFindFirst.mockResolvedValue(member);
        tsFindFirst.mockResolvedValue(null);

        await expect(
          service.create(
            1,
            5,
            { memberId: 77, staffRole: 'ADJOINT' },
            { memberId: 42, scope: 'TEAM' },
          ),
        ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
      });

      it('autorise le Principal en poste (scope TEAM) à créer un Co-entraîneur/Adjoint', async () => {
        teamFindFirst.mockResolvedValue(team);
        memberFindFirst.mockResolvedValue(member);
        tsFindFirst.mockResolvedValue({ ...principalAssignment, memberId: 1 });
        tx.teamStaff.findFirst.mockResolvedValue(null);
        tx.teamStaff.create.mockResolvedValue(adjointAssignment);

        await expect(
          service.create(
            1,
            5,
            { memberId: 42, staffRole: 'ADJOINT' },
            { memberId: 1, scope: 'TEAM' },
          ),
        ).resolves.toBe(adjointAssignment);
      });

      it('autorise un scope CLUB/ALL même sans aucune affectation de staff', async () => {
        teamFindFirst.mockResolvedValue(team);
        memberFindFirst.mockResolvedValue(member);
        tx.teamStaff.findFirst.mockResolvedValue(null);
        tx.teamStaff.create.mockResolvedValue(adjointAssignment);

        await expect(
          service.create(
            1,
            5,
            { memberId: 42, staffRole: 'ADJOINT' },
            adminRequester,
          ),
        ).resolves.toBe(adjointAssignment);
        expect(tsFindFirst).not.toHaveBeenCalled();
      });
    });

    describe('règle — assigner PRINCIPAL est réservé au scope CLUB/ALL', () => {
      it('refuse un scope TEAM (même le Principal en poste) qui tente de créer un PRINCIPAL', async () => {
        teamFindFirst.mockResolvedValue(team);
        memberFindFirst.mockResolvedValue(member);
        tsFindFirst.mockResolvedValue({ ...principalAssignment, memberId: 1 });

        await expect(
          service.create(
            1,
            5,
            { memberId: 42, staffRole: 'PRINCIPAL' },
            { memberId: 1, scope: 'TEAM' },
          ),
        ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
        expect(transaction).not.toHaveBeenCalled();
      });

      it('autorise un scope CLUB à créer un PRINCIPAL', async () => {
        teamFindFirst.mockResolvedValue(team);
        memberFindFirst.mockResolvedValue(member);
        tx.teamStaff.findFirst.mockResolvedValue(null);
        tx.teamStaff.create.mockResolvedValue(principalAssignment);

        await expect(
          service.create(
            1,
            5,
            { memberId: 42, staffRole: 'PRINCIPAL' },
            adminRequester,
          ),
        ).resolves.toBe(principalAssignment);
      });
    });
  });

  describe('findAllByTeam', () => {
    it('ne renvoie que les affectations actives (endDate null)', async () => {
      teamFindFirst.mockResolvedValue(team);
      tsFindMany.mockResolvedValue([adjointAssignment]);

      const result = await service.findAllByTeam(1, 5);

      expect(result).toEqual([adjointAssignment]);
      expect(tsFindMany).toHaveBeenCalledWith({
        where: { teamId: 5, endDate: null },
        orderBy: { staffRole: 'asc' },
      });
    });
  });

  describe('update — exception de protection du Principal', () => {
    it("un scope TEAM (Adjoint/Co-entraîneur) ne peut pas modifier la fiche d'un AUTRE membre Principal", async () => {
      tsFindFirst.mockResolvedValue(principalAssignment);

      await expect(
        service.update(
          1,
          5,
          300,
          { staffRole: 'CO_ENTRAINEUR' },
          {
            memberId: 42,
            scope: 'TEAM',
          },
        ),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
      expect(transaction).not.toHaveBeenCalled();
    });

    it('un scope TEAM peut modifier sa PROPRE fiche même si elle est Principal', async () => {
      const ownPrincipal = { ...principalAssignment, memberId: 42 };
      tsFindFirst.mockResolvedValue(ownPrincipal);
      tx.teamStaff.update.mockResolvedValue(ownPrincipal);

      await expect(
        service.update(
          1,
          5,
          300,
          { startDate: new Date('2026-01-01') },
          {
            memberId: 42,
            scope: 'TEAM',
          },
        ),
      ).resolves.toBe(ownPrincipal);
    });

    it('un scope TEAM peut modifier la fiche d’un Adjoint/Co-entraîneur (non Principal)', async () => {
      tsFindFirst.mockResolvedValue(adjointAssignment);
      tx.teamStaff.update.mockResolvedValue(adjointAssignment);

      await expect(
        service.update(
          1,
          5,
          301,
          { staffRole: 'CO_ENTRAINEUR' },
          {
            memberId: 99,
            scope: 'TEAM',
          },
        ),
      ).resolves.toBe(adjointAssignment);
    });

    it('un scope CLUB (AdminClub) peut modifier la fiche du Principal', async () => {
      tsFindFirst.mockResolvedValue(principalAssignment);
      tx.teamStaff.update.mockResolvedValue(principalAssignment);

      await expect(
        service.update(
          1,
          5,
          300,
          { staffRole: 'CO_ENTRAINEUR' },
          adminRequester,
        ),
      ).resolves.toBe(principalAssignment);
    });

    it('renvoie 404 si l’affectation est introuvable dans cette équipe/club', async () => {
      tsFindFirst.mockResolvedValue(null);

      await expect(
        service.update(1, 5, 300, {}, { memberId: 42, scope: 'TEAM' }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });
  });

  describe('update — règle : promotion vers PRINCIPAL réservée au scope CLUB/ALL', () => {
    it('refuse un scope TEAM qui tente de promouvoir un Adjoint/Co-entraîneur en PRINCIPAL', async () => {
      tsFindFirst.mockResolvedValue(adjointAssignment);

      await expect(
        service.update(
          1,
          5,
          301,
          { staffRole: 'PRINCIPAL' },
          { memberId: 42, scope: 'TEAM' },
        ),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
      expect(transaction).not.toHaveBeenCalled();
    });

    it('autorise un scope CLUB à promouvoir un Adjoint en PRINCIPAL', async () => {
      tsFindFirst.mockResolvedValue(adjointAssignment);
      tx.teamStaff.update.mockResolvedValue({
        ...adjointAssignment,
        staffRole: 'PRINCIPAL',
      });

      await expect(
        service.update(1, 5, 301, { staffRole: 'PRINCIPAL' }, adminRequester),
      ).resolves.toMatchObject({ staffRole: 'PRINCIPAL' });
    });

    it("n'applique pas la règle quand le Principal édite sa propre fiche sans changer staffRole", async () => {
      const ownPrincipal = { ...principalAssignment, memberId: 42 };
      tsFindFirst.mockResolvedValue(ownPrincipal);
      tx.teamStaff.update.mockResolvedValue(ownPrincipal);

      await expect(
        service.update(
          1,
          5,
          300,
          { staffRole: 'PRINCIPAL' },
          { memberId: 42, scope: 'TEAM' },
        ),
      ).resolves.toBe(ownPrincipal);
    });
  });

  describe('update — révocation symétrique du MemberRole Coach', () => {
    it('archiver (endDate transmis) une affectation active révoque son MemberRole Coach', async () => {
      tsFindFirst.mockResolvedValue(adjointAssignment);
      tx.teamStaff.update.mockResolvedValue({
        ...adjointAssignment,
        endDate: new Date('2026-08-01'),
      });
      tx.memberRole.findFirst.mockResolvedValue(activeCoachMemberRole);

      await service.update(
        1,
        5,
        301,
        { endDate: new Date('2026-08-01') },
        adminRequester,
      );

      expect(tx.memberRole.findFirst).toHaveBeenCalledWith({
        where: {
          memberId: 42,
          clubId: 1,
          teamId: 5,
          endDate: null,
          role: { name: 'Coach', isSystem: true },
        },
      });
      expect(tx.memberRole.update).toHaveBeenCalledWith({
        where: { id: 900 },
        data: { endDate: new Date('2026-08-01') },
      });
    });

    it('une affectation déjà archivée (endDate déjà non null) ne redéclenche pas la révocation', async () => {
      const alreadyArchived = {
        ...adjointAssignment,
        endDate: new Date('2026-01-01'),
      };
      tsFindFirst.mockResolvedValue(alreadyArchived);
      tx.teamStaff.update.mockResolvedValue(alreadyArchived);

      await service.update(
        1,
        5,
        301,
        { startDate: new Date('2026-02-01') },
        adminRequester,
      );

      expect(tx.memberRole.findFirst).not.toHaveBeenCalled();
    });

    it('un update sans endDate ne révoque rien', async () => {
      tsFindFirst.mockResolvedValue(adjointAssignment);
      tx.teamStaff.update.mockResolvedValue(adjointAssignment);

      await service.update(
        1,
        5,
        301,
        { staffRole: 'CO_ENTRAINEUR' },
        adminRequester,
      );

      expect(tx.memberRole.findFirst).not.toHaveBeenCalled();
    });

    it("n'échoue pas si aucun MemberRole actif correspondant n'est trouvé (affectation créée avant cette écriture jointe)", async () => {
      tsFindFirst.mockResolvedValue(adjointAssignment);
      tx.teamStaff.update.mockResolvedValue({
        ...adjointAssignment,
        endDate: new Date('2026-08-01'),
      });
      tx.memberRole.findFirst.mockResolvedValue(null);

      await expect(
        service.update(
          1,
          5,
          301,
          { endDate: new Date('2026-08-01') },
          adminRequester,
        ),
      ).resolves.toBeDefined();
      expect(tx.memberRole.update).not.toHaveBeenCalled();
    });
  });

  describe('archive — action de premier ordre, délègue à update()', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-10T12:00:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("fixe endDate à aujourd'hui quand aucune date n'est transmise", async () => {
      tsFindFirst.mockResolvedValue(adjointAssignment);
      tx.teamStaff.update.mockResolvedValue({
        ...adjointAssignment,
        endDate: new Date(),
      });

      await service.archive(1, 5, 301, adminRequester);

      expect(tx.teamStaff.update).toHaveBeenCalledWith({
        where: { id: 301 },
        data: {
          staffRole: undefined,
          startDate: undefined,
          endDate: new Date('2026-07-10T12:00:00.000Z'),
        },
      });
    });

    it('utilise la date choisie si elle est transmise', async () => {
      tsFindFirst.mockResolvedValue(adjointAssignment);
      const endDate = new Date('2026-08-31');
      tx.teamStaff.update.mockResolvedValue({ ...adjointAssignment, endDate });

      await service.archive(1, 5, 301, adminRequester, endDate);

      expect(tx.teamStaff.update).toHaveBeenCalledWith({
        where: { id: 301 },
        data: { staffRole: undefined, startDate: undefined, endDate },
      });
    });

    it("respecte assertCanModifyPrincipal : un scope TEAM ne peut pas archiver la fiche d'un AUTRE Principal", async () => {
      tsFindFirst.mockResolvedValue(principalAssignment);

      await expect(
        service.archive(1, 5, 300, { memberId: 42, scope: 'TEAM' }),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
      expect(transaction).not.toHaveBeenCalled();
    });
  });

  describe('remove — même exception que update', () => {
    it("un scope TEAM ne peut pas retirer la fiche d'un AUTRE membre Principal", async () => {
      tsFindFirst.mockResolvedValue(principalAssignment);

      await expect(
        service.remove(1, 5, 300, { memberId: 42, scope: 'TEAM' }),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
      expect(tx.teamStaff.delete).not.toHaveBeenCalled();
    });

    it('un scope CLUB peut retirer la fiche du Principal', async () => {
      tsFindFirst.mockResolvedValue(principalAssignment);

      await service.remove(1, 5, 300, adminRequester);

      expect(tx.teamStaff.delete).toHaveBeenCalledWith({ where: { id: 300 } });
    });
  });

  describe('remove — révocation symétrique du MemberRole Coach', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-10T12:00:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('retirer une affectation active révoque son MemberRole Coach', async () => {
      tsFindFirst.mockResolvedValue(adjointAssignment);
      tx.memberRole.findFirst.mockResolvedValue(activeCoachMemberRole);

      await service.remove(1, 5, 301, adminRequester);

      expect(tx.memberRole.findFirst).toHaveBeenCalledWith({
        where: {
          memberId: 42,
          clubId: 1,
          teamId: 5,
          endDate: null,
          role: { name: 'Coach', isSystem: true },
        },
      });
      expect(tx.memberRole.update).toHaveBeenCalledWith({
        where: { id: 900 },
        data: { endDate: new Date('2026-07-10T12:00:00.000Z') },
      });
      expect(tx.teamStaff.delete).toHaveBeenCalledWith({ where: { id: 301 } });
    });

    it('retirer une affectation déjà archivée ne tente pas de révoquer un MemberRole', async () => {
      const archived = {
        ...adjointAssignment,
        endDate: new Date('2026-01-01'),
      };
      tsFindFirst.mockResolvedValue(archived);

      await service.remove(1, 5, 301, adminRequester);

      expect(tx.memberRole.findFirst).not.toHaveBeenCalled();
      expect(tx.teamStaff.delete).toHaveBeenCalledWith({ where: { id: 301 } });
    });
  });
});
