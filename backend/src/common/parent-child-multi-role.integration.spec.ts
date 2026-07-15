import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Member, PlayerProfile } from '@prisma/client';
import { AppException } from './exceptions/app.exception';
import {
  PermissionedRequest,
  PermissionsGuard,
} from '../auth/guards/permissions.guard';
import { MembersService } from '../members/members.service';
import { PermissionsService } from '../roles/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlayersController } from '../players/players.controller';
import { PlayersService } from '../players/players.service';
import { PlayerNotesController } from '../player-notes/player-notes.controller';
import { PlayerNotesService } from '../player-notes/player-notes.service';
import { PlayerObjectivesController } from '../player-objectives/player-objectives.controller';
import { PlayerObjectivesService } from '../player-objectives/player-objectives.service';
import { PlayerAbsencesController } from '../player-absences/player-absences.controller';
import { PlayerAbsencesService } from '../player-absences/player-absences.service';
import { MembersController } from '../members/members.controller';
import { MembersService as MembersServiceImpl } from '../members/members.service';

/**
 * Scénario multi-rôles de référence (docs/modules/auth-roles.md
 * §"Multi-rôles — règle de test obligatoire") appliqué au scope `PARENT`
 * (docs/decisions-ouvertes-et-rgpd.md #5, tranché) : un même Club 1, un
 * Parent (Alice) qui cumule aussi un rôle Coach sur une AUTRE équipe, et un
 * membre (Bob) qui cumule Player ET Parent sur le MÊME contexte club/équipe
 * — cas piège identifié en conception (voir docs/modules/auth-roles.md
 * §Rôle Parent) où le scope résolu pourrait devenir `PARENT` même en
 * consultant son propre profil.
 *
 * Alice (userId 80, Member 60, Club 1) :
 * - Coach de l'équipe 5 — scope TEAM (contexte totalement disjoint du Parent).
 * - Parent de Léo (Member 90, équipe 9) via ParentChild(60, 90) — scope PARENT.
 *
 * Bob (userId 81, Member 70, Club 1) :
 * - Player de l'équipe 9 (profil 700, memberId 70) — scope OWN.
 * - Parent (aussi scopé équipe 9, aucun enfant lié) — scope PARENT en
 *   compétition avec OWN sur le même contexte : doit rester capable de
 *   consulter son propre profil sans qu'un lien ParentChild(70, 70) soit requis.
 */

const aliceMember: Member = {
  id: 60,
  userId: 80,
  clubId: 1,
  firstName: 'Alice',
  lastName: 'Martin',
  phone: null,
  avatarUrl: null,
  gender: null,
  birthDate: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const bobMember: Member = {
  id: 70,
  userId: 81,
  clubId: 1,
  firstName: 'Bob',
  lastName: 'Leroy',
  phone: null,
  avatarUrl: null,
  gender: null,
  birthDate: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const leoProfile: PlayerProfile = {
  id: 900,
  memberId: 90,
  licenseNumber: null,
  nationality: null,
  preferredFoot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Coéquipier de Léo dans la même équipe (9), NON lié à Alice — sert à
// vérifier que le scope PARENT n'ouvre jamais l'accès à toute l'équipe,
// contrairement à TEAM : seul le lien ParentChild compte.
const leoTeammateProfile: PlayerProfile = {
  id: 901,
  memberId: 91,
  licenseNumber: null,
  nationality: null,
  preferredFoot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const bobProfile: PlayerProfile = {
  id: 700,
  memberId: 70,
  licenseNumber: null,
  nationality: null,
  preferredFoot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function buildContext(
  request: Partial<PermissionedRequest>,
  handler: (...args: any[]) => unknown,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
  } as unknown as ExecutionContext;
}

function buildGuard() {
  const readTeam = {
    id: 1,
    resource: 'player_profile',
    action: 'READ',
    scope: 'TEAM',
  };
  const readOwn = {
    id: 2,
    resource: 'player_profile',
    action: 'READ',
    scope: 'OWN',
  };
  const readParent = {
    id: 3,
    resource: 'player_profile',
    action: 'READ',
    scope: 'PARENT',
  };
  const readNoteParent = {
    id: 4,
    resource: 'player_note',
    action: 'READ',
    scope: 'PARENT',
  };
  const readAbsenceParent = {
    id: 5,
    resource: 'player_absence',
    action: 'READ',
    scope: 'PARENT',
  };
  const createAbsenceParent = {
    id: 6,
    resource: 'player_absence',
    action: 'CREATE',
    scope: 'PARENT',
  };
  const readMemberParent = {
    id: 7,
    resource: 'member',
    action: 'READ',
    scope: 'PARENT',
  };
  const updateMemberParent = {
    id: 8,
    resource: 'member',
    action: 'UPDATE',
    scope: 'PARENT',
  };
  const readObjectiveParent = {
    id: 9,
    resource: 'player_objective',
    action: 'READ',
    scope: 'PARENT',
  };

  const coachRole = {
    id: 1,
    isSystem: true,
    rolePermissions: [{ permission: readTeam }],
  };
  const parentRole = {
    id: 2,
    isSystem: true,
    rolePermissions: [
      { permission: readParent },
      { permission: readNoteParent },
      { permission: readAbsenceParent },
      { permission: createAbsenceParent },
      { permission: readMemberParent },
      { permission: updateMemberParent },
      { permission: readObjectiveParent },
    ],
  };
  const playerRole = {
    id: 3,
    isSystem: true,
    rolePermissions: [{ permission: readOwn }],
  };

  const memberRolesByMember: Record<number, any[]> = {
    // Alice : Coach équipe 5 (contexte disjoint) + Parent équipe 9 (celle de Léo).
    60: [
      {
        memberId: 60,
        clubId: 1,
        teamId: 5,
        startDate: null,
        endDate: null,
        role: coachRole,
      },
      {
        memberId: 60,
        clubId: 1,
        teamId: 9,
        startDate: null,
        endDate: null,
        role: parentRole,
      },
    ],
    // Bob : Player ET Parent sur le MÊME contexte (équipe 9) — cas piège.
    70: [
      {
        memberId: 70,
        clubId: 1,
        teamId: 9,
        startDate: null,
        endDate: null,
        role: playerRole,
      },
      {
        memberId: 70,
        clubId: 1,
        teamId: 9,
        startDate: null,
        endDate: null,
        role: parentRole,
      },
    ],
  };
  const permissionsPrismaStub = {
    memberRole: {
      findMany: jest.fn(
        ({ where: { memberId } }: { where: { memberId: number } }) =>
          Promise.resolve(memberRolesByMember[memberId] ?? []),
      ),
    },
    userRole: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
  const permissionsService = new PermissionsService(permissionsPrismaStub);

  const membersByUserAndClub: Record<string, Member> = {
    '80:1': aliceMember,
    '81:1': bobMember,
  };
  const findByUserAndClub = jest.fn((userId: number, clubId: number) =>
    Promise.resolve(membersByUserAndClub[`${userId}:${clubId}`] ?? null),
  );
  const membersService = { findByUserAndClub } as unknown as MembersService;

  return new PermissionsGuard(
    new Reflector(),
    permissionsService,
    membersService,
  );
}

function findPlayerAmong(profiles: PlayerProfile[]) {
  return jest.fn(({ where: { id } }: { where: { id: number } }) =>
    Promise.resolve(profiles.find((p) => p.id === id) ?? null),
  );
}

describe('Correctif transverse — Liaison Parent↔Enfant (scope PARENT)', () => {
  let guard: PermissionsGuard;
  let parentChildFindUnique: jest.Mock;

  beforeEach(() => {
    guard = buildGuard();
    // Seul le lien Alice(60)→Léo(90) existe.
    parentChildFindUnique = jest.fn(
      ({
        where: {
          parentMemberId_childMemberId: { parentMemberId, childMemberId },
        },
      }: {
        where: {
          parentMemberId_childMemberId: {
            parentMemberId: number;
            childMemberId: number;
          };
        };
      }) =>
        Promise.resolve(
          parentMemberId === 60 && childMemberId === 90
            ? { id: 1, parentMemberId: 60, childMemberId: 90 }
            : null,
        ),
    );
  });

  describe('PlayersService.findOne', () => {
    /* eslint-disable @typescript-eslint/unbound-method */
    const findOneHandler = PlayersController.prototype.findOne;
    /* eslint-enable @typescript-eslint/unbound-method */
    let service: PlayersService;
    let playerFindFirst: jest.Mock;

    beforeEach(() => {
      playerFindFirst = findPlayerAmong([
        leoProfile,
        leoTeammateProfile,
        bobProfile,
      ]);
      const prismaStub = {
        playerProfile: { findFirst: playerFindFirst },
        parentChild: { findUnique: parentChildFindUnique },
      } as unknown as PrismaService;
      service = new PlayersService(prismaStub, {} as MembersService);
    });

    it('Alice (Parent liée) consulte le profil de Léo', async () => {
      const request = {
        params: { clubId: '1', id: '900' },
        query: { teamId: '9' },
        user: { userId: 80 },
      } as Partial<PermissionedRequest>;
      await guard.canActivate(buildContext(request, findOneHandler));
      expect(request.permissionScope).toBe('PARENT');

      const profile = await service.findOne(1, 900, {
        memberId: request.member!.id,
        scope: 'PARENT',
        teamId: 9,
      });
      expect(profile).toBe(leoProfile);
    });

    it("Alice ne peut PAS consulter le coéquipier de Léo dans la même équipe — seul le lien ParentChild compte, pas l'équipe", async () => {
      await expect(
        service.findOne(1, 901, { memberId: 60, scope: 'PARENT', teamId: 9 }),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('Bob (Player + Parent sur le même contexte) consulte son propre profil sans lien ParentChild sur lui-même', async () => {
      const request = {
        params: { clubId: '1', id: '700' },
        query: { teamId: '9' },
        user: { userId: 81 },
      } as Partial<PermissionedRequest>;
      await guard.canActivate(buildContext(request, findOneHandler));
      // widestOf résout PARENT (index le plus large parmi OWN/PARENT ici) —
      // exactement le cas piège documenté : le service doit quand même
      // laisser passer Bob sur SON PROPRE profil.
      expect(request.permissionScope).toBe('PARENT');

      const profile = await service.findOne(1, 700, {
        memberId: request.member!.id,
        scope: 'PARENT',
        teamId: 9,
      });
      expect(profile).toBe(bobProfile);
      expect(parentChildFindUnique).not.toHaveBeenCalled();
    });
  });

  describe('PlayerNotesService.findAllByPlayer — visibilité PUBLIC uniquement', () => {
    /* eslint-disable @typescript-eslint/unbound-method */
    const findAllHandler = PlayerNotesController.prototype.findAll;
    /* eslint-enable @typescript-eslint/unbound-method */
    let service: PlayerNotesService;

    beforeEach(() => {
      const playerFindFirst = findPlayerAmong([leoProfile]);
      const noteFindMany = jest.fn().mockResolvedValue([
        { id: 1, playerId: 900, visibility: 'PRIVE', content: 'Note staff' },
        {
          id: 2,
          playerId: 900,
          visibility: 'SEMI_PRIVE',
          content: 'Note joueur',
        },
        {
          id: 3,
          playerId: 900,
          visibility: 'PUBLIC',
          content: 'Note publique',
        },
      ]);
      const prismaStub = {
        playerProfile: { findFirst: playerFindFirst },
        playerNote: { findMany: noteFindMany },
        parentChild: { findUnique: parentChildFindUnique },
      } as unknown as PrismaService;
      service = new PlayerNotesService(prismaStub);
    });

    it('Alice ne voit que les notes PUBLIC de Léo, jamais SEMI_PRIVE ni PRIVE', async () => {
      const request = {
        params: { clubId: '1', playerId: '900' },
        query: { teamId: '9' },
        user: { userId: 80 },
      } as Partial<PermissionedRequest>;
      await guard.canActivate(buildContext(request, findAllHandler));
      expect(request.permissionScope).toBe('PARENT');

      const result = await service.findAllByPlayer(1, 900, {
        memberId: request.member!.id,
        scope: 'PARENT',
        teamId: 9,
      });
      expect(result.map((n: { id: number }) => n.id)).toEqual([3]);
    });
  });

  describe('PlayerObjectivesService.findAllByPlayer — visibilité PUBLIC uniquement', () => {
    /* eslint-disable @typescript-eslint/unbound-method */
    const findAllHandler = PlayerObjectivesController.prototype.findAll;
    /* eslint-enable @typescript-eslint/unbound-method */
    let service: PlayerObjectivesService;

    beforeEach(() => {
      const playerFindFirst = findPlayerAmong([leoProfile]);
      const objectiveFindMany = jest.fn().mockResolvedValue([
        {
          id: 1,
          playerId: 900,
          visibility: 'PRIVE',
          description: 'Objectif staff',
        },
        {
          id: 2,
          playerId: 900,
          visibility: 'SEMI_PRIVE',
          description: 'Objectif joueur',
        },
        {
          id: 3,
          playerId: 900,
          visibility: 'PUBLIC',
          description: 'Objectif public',
        },
      ]);
      const prismaStub = {
        playerProfile: { findFirst: playerFindFirst },
        playerObjective: { findMany: objectiveFindMany },
        parentChild: { findUnique: parentChildFindUnique },
      } as unknown as PrismaService;
      service = new PlayerObjectivesService(prismaStub);
    });

    it('Alice ne voit que les objectifs PUBLIC de Léo, jamais SEMI_PRIVE ni PRIVE', async () => {
      const request = {
        params: { clubId: '1', playerId: '900' },
        query: { teamId: '9' },
        user: { userId: 80 },
      } as Partial<PermissionedRequest>;
      // Nécessite player_objective READ PARENT au guard — déjà couvert par
      // le rôle Parent de buildGuard via player_note (même mécanisme),
      // ajouté ici explicitement pour cette ressource.
      await guard.canActivate(buildContext(request, findAllHandler));

      const result = await service.findAllByPlayer(1, 900, {
        memberId: request.member!.id,
        scope: 'PARENT',
        teamId: 9,
      });
      expect(result.map((o: { id: number }) => o.id)).toEqual([3]);
    });
  });

  describe('PlayerAbsencesService.create — déclaration pour son enfant', () => {
    /* eslint-disable @typescript-eslint/unbound-method */
    const createHandler = PlayerAbsencesController.prototype.create;
    /* eslint-enable @typescript-eslint/unbound-method */
    let service: PlayerAbsencesService;
    let absenceCreate: jest.Mock;

    beforeEach(() => {
      const playerFindFirst = findPlayerAmong([leoProfile]);
      absenceCreate = jest.fn().mockResolvedValue({ id: 1 });
      const prismaStub = {
        playerProfile: { findFirst: playerFindFirst },
        playerAbsence: { create: absenceCreate },
        parentChild: { findUnique: parentChildFindUnique },
      } as unknown as PrismaService;
      service = new PlayerAbsencesService(prismaStub);
    });

    it('Alice déclare une absence à venir pour Léo, isExcused forcé à null même si transmis', async () => {
      const request = {
        params: { clubId: '1', playerId: '900' },
        query: { teamId: '9' },
        user: { userId: 80 },
      } as Partial<PermissionedRequest>;
      await guard.canActivate(buildContext(request, createHandler));
      expect(request.permissionScope).toBe('PARENT');

      await service.create(
        1,
        900,
        request.member!.id,
        {
          reason: 'INJURY',
          startDate: new Date('2026-08-01'),
          endDate: new Date('2026-08-03'),
          isExcused: true,
        },
        { memberId: request.member!.id, scope: 'PARENT', teamId: 9 },
      );

      expect(absenceCreate).toHaveBeenCalledWith({
        data: {
          playerId: 900,
          reportedById: request.member!.id,
          reason: 'INJURY',
          description: undefined,
          startDate: new Date('2026-08-01'),
          endDate: new Date('2026-08-03'),
          isExcused: null,
        },
        include: { reportedBy: true },
      });
    });
  });

  describe('MembersService.update — informations personnelles de son enfant', () => {
    /* eslint-disable @typescript-eslint/unbound-method */
    const updateHandler = MembersController.prototype.update;
    /* eslint-enable @typescript-eslint/unbound-method */
    let service: MembersServiceImpl;
    let memberFindFirst: jest.Mock;
    let memberUpdate: jest.Mock;

    beforeEach(() => {
      memberFindFirst = jest.fn(
        ({ where: { id } }: { where: { id: number } }) =>
          Promise.resolve(
            [
              { id: 90, clubId: 1, firstName: 'Léo', lastName: 'Martin' },
              { id: 91, clubId: 1, firstName: 'Autre', lastName: 'Joueur' },
            ].find((m) => m.id === id) ?? null,
          ),
      );
      memberUpdate = jest
        .fn()
        .mockResolvedValue({ id: 90, firstName: 'Léo M.' });
      const prismaStub = {
        member: { findFirst: memberFindFirst, update: memberUpdate },
        parentChild: { findUnique: parentChildFindUnique },
      } as unknown as PrismaService;
      service = new MembersServiceImpl(prismaStub, {} as PermissionsService);
    });

    it('Alice modifie les informations personnelles de Léo', async () => {
      const request = {
        params: { clubId: '1', id: '90' },
        query: { teamId: '9' },
        user: { userId: 80 },
      } as Partial<PermissionedRequest>;
      await guard.canActivate(buildContext(request, updateHandler));
      expect(request.permissionScope).toBe('PARENT');

      await service.update(
        1,
        90,
        { phone: '0600000000' },
        { memberId: request.member!.id, scope: 'PARENT' },
      );
      expect(memberUpdate).toHaveBeenCalledWith({
        where: { id: 90 },
        data: { phone: '0600000000' },
      });
    });

    it("Alice ne peut PAS modifier un membre non lié, même dans l'équipe de Léo", async () => {
      await expect(
        service.update(
          1,
          91,
          { phone: '0600000000' },
          { memberId: 60, scope: 'PARENT' },
        ),
      ).rejects.toBeInstanceOf(AppException);
      expect(memberUpdate).not.toHaveBeenCalled();
    });
  });
});
