import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from './permissions.service';

/**
 * Fixtures reproduisant le scénario multi-rôles de référence de
 * docs/modules/auth-roles.md ("Marc est Coach de l'équipe U15 (Club A), Player
 * dans l'équipe Seniors (Club A), et Parent d'un joueur dans l'équipe U10 (Club B)").
 */

const permissions = {
  memberReadTeam: { id: 1, resource: 'member', action: 'READ', scope: 'TEAM' },
  memberUpdateTeam: {
    id: 2,
    resource: 'member',
    action: 'UPDATE',
    scope: 'TEAM',
  },
  memberReadOwn: { id: 3, resource: 'member', action: 'READ', scope: 'OWN' },
  memberReadClub: { id: 4, resource: 'member', action: 'READ', scope: 'CLUB' },
  memberDeleteClub: {
    id: 5,
    resource: 'member',
    action: 'DELETE',
    scope: 'CLUB',
  },
} as const;

const roles = {
  coach: {
    id: 1,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.memberReadTeam },
      { permission: permissions.memberUpdateTeam },
    ],
  },
  player: {
    id: 2,
    isSystem: true,
    rolePermissions: [{ permission: permissions.memberReadOwn }],
  },
  parent: {
    id: 3,
    isSystem: true,
    rolePermissions: [{ permission: permissions.memberReadOwn }],
  },
  adminClub: {
    id: 4,
    isSystem: true,
    rolePermissions: [
      { permission: permissions.memberReadClub },
      { permission: permissions.memberDeleteClub },
    ],
  },
  // Rôle personnalisé exemple : lecture d'équipe seulement, jamais de modification.
  physiotherapeute: {
    id: 5,
    isSystem: false,
    rolePermissions: [{ permission: permissions.memberReadTeam }],
  },
};

// memberId 42 = Marc, memberId 99 = AdminClub club-wide, memberId 7 = rôle
// personnalisé Physiotherapeute, memberId 1000 = aucun rôle.
const memberRolesByMember: Record<number, any[]> = {
  42: [
    {
      memberId: 42,
      clubId: 1,
      teamId: 5,
      startDate: null,
      endDate: null,
      role: roles.coach,
    },
    {
      memberId: 42,
      clubId: 1,
      teamId: 8,
      startDate: null,
      endDate: null,
      role: roles.player,
    },
    {
      memberId: 42,
      clubId: 2,
      teamId: 12,
      startDate: null,
      endDate: null,
      role: roles.parent,
    },
  ],
  99: [
    {
      memberId: 99,
      clubId: 1,
      teamId: null,
      startDate: null,
      endDate: null,
      role: roles.adminClub,
    },
  ],
  7: [
    {
      memberId: 7,
      clubId: 1,
      teamId: 5,
      startDate: null,
      endDate: null,
      role: roles.physiotherapeute,
    },
  ],
  1000: [],
};

// Rôle plateforme (UserRole, indépendant de tout Member/Club) — voir
// docs/modules/auth-roles.md §Rôles plateforme.
const platformPermissions = {
  memberReadAll: { id: 6, resource: 'member', action: 'READ', scope: 'ALL' },
};

const platformRoles = {
  proprietaire: {
    id: 6,
    isSystem: true,
    rolePermissions: [{ permission: platformPermissions.memberReadAll }],
  },
};

// userId 500 = Propriétaire actif, 501 = rôle plateforme expiré (endDate
// passée), 502 = rôle plateforme pas encore actif (startDate future),
// 1000 = aucun rôle plateforme.
const userRolesByUser: Record<number, any[]> = {
  500: [
    {
      userId: 500,
      startDate: null,
      endDate: null,
      role: platformRoles.proprietaire,
    },
  ],
  501: [
    {
      userId: 501,
      startDate: null,
      endDate: new Date('2020-01-01'),
      role: platformRoles.proprietaire,
    },
  ],
  502: [
    {
      userId: 502,
      startDate: new Date('2999-01-01'),
      endDate: null,
      role: platformRoles.proprietaire,
    },
  ],
  1000: [],
};

function buildPrismaStub() {
  return {
    memberRole: {
      findMany: jest.fn(
        ({ where: { memberId } }: { where: { memberId: number } }) =>
          Promise.resolve(memberRolesByMember[memberId] ?? []),
      ),
    },
    userRole: {
      findMany: jest.fn(
        ({ where: { userId } }: { where: { userId: number } }) =>
          Promise.resolve(userRolesByUser[userId] ?? []),
      ),
      findFirst: jest.fn(({ where }: { where: { userId: number } }) => {
        const now = new Date();
        const rows = (userRolesByUser[where.userId] ?? []) as {
          startDate: Date | null;
          endDate: Date | null;
        }[];
        const active = rows.find((row) => {
          if (row.startDate && row.startDate > now) return false;
          if (row.endDate && row.endDate < now) return false;
          return true;
        });
        return Promise.resolve(active ?? null);
      }),
    },
  };
}

describe('PermissionsService', () => {
  let service: PermissionsService;

  beforeEach(() => {
    service = new PermissionsService(
      buildPrismaStub() as unknown as PrismaService,
    );
  });

  it('refuse tout accès à un membre sans aucun rôle', async () => {
    const result = await service.can(1000, 'READ', 'member', {
      clubId: 1,
      teamId: 5,
    });
    expect(result).toBeNull();
  });

  it("un rôle système (Coach) fait exactement ce qu'il doit dans son équipe", async () => {
    expect(
      await service.can(42, 'READ', 'member', { clubId: 1, teamId: 5 }),
    ).toBe('TEAM');
    expect(
      await service.can(42, 'UPDATE', 'member', { clubId: 1, teamId: 5 }),
    ).toBe('TEAM');
    // Le Coach n'a pas la permission DELETE, quel que soit le scope.
    expect(
      await service.can(42, 'DELETE', 'member', { clubId: 1, teamId: 5 }),
    ).toBeNull();
  });

  it("un rôle scopé à l'équipe A ne donne aucun accès à l'équipe B du même club", async () => {
    // MemberRole Coach de Marc est scopé teamId=5 uniquement.
    const result = await service.can(42, 'READ', 'member', {
      clubId: 1,
      teamId: 6,
    });
    expect(result).toBeNull();
  });

  it('scénario multi-rôles (Marc) : trois rôles, trois contextes, trois jeux de droits', async () => {
    // Coach de l'U15 (Club A)
    expect(
      await service.can(42, 'READ', 'member', { clubId: 1, teamId: 5 }),
    ).toBe('TEAM');
    // Player en Seniors (Club A) — accès à ses propres données uniquement
    expect(
      await service.can(42, 'READ', 'member', { clubId: 1, teamId: 8 }),
    ).toBe('OWN');
    // Parent dans l'U10 (Club B) — accès à ses propres données uniquement
    expect(
      await service.can(42, 'READ', 'member', { clubId: 2, teamId: 12 }),
    ).toBe('OWN');
    // Aucune fuite du rôle Parent vers une autre équipe du Club B
    expect(
      await service.can(42, 'READ', 'member', { clubId: 2, teamId: 99 }),
    ).toBeNull();
    // Aucune fuite d'un rôle du Club A vers le Club B
    expect(
      await service.can(42, 'READ', 'member', { clubId: 2, teamId: 5 }),
    ).toBeNull();
  });

  it('un rôle scopé club entier (AdminClub, teamId=null) couvre toutes les équipes du club', async () => {
    expect(
      await service.can(99, 'READ', 'member', { clubId: 1, teamId: 5 }),
    ).toBe('CLUB');
    expect(
      await service.can(99, 'DELETE', 'member', { clubId: 1, teamId: 8 }),
    ).toBe('CLUB');
    // Mais pas un autre club.
    expect(
      await service.can(99, 'READ', 'member', { clubId: 2, teamId: 1 }),
    ).toBeNull();
  });

  it('un rôle personnalisé avec permissions limitées respecte ces limites', async () => {
    expect(
      await service.can(7, 'READ', 'member', { clubId: 1, teamId: 5 }),
    ).toBe('TEAM');
    // Physiotherapeute n'a pas la permission UPDATE sur member.
    expect(
      await service.can(7, 'UPDATE', 'member', { clubId: 1, teamId: 5 }),
    ).toBeNull();
  });

  describe('canAsUser (rôle plateforme, UserRole)', () => {
    it('accorde le scope du rôle plateforme actif', async () => {
      expect(await service.canAsUser(500, 'READ', 'member')).toBe('ALL');
    });

    it('refuse pour un utilisateur sans aucun rôle plateforme', async () => {
      expect(await service.canAsUser(1000, 'READ', 'member')).toBeNull();
    });

    it('ignore un rôle plateforme dont endDate est déjà passée', async () => {
      expect(await service.canAsUser(501, 'READ', 'member')).toBeNull();
    });

    it("ignore un rôle plateforme dont startDate n'est pas encore atteinte", async () => {
      expect(await service.canAsUser(502, 'READ', 'member')).toBeNull();
    });
  });

  describe('hasActivePlatformRole', () => {
    it('vrai pour un rôle plateforme actif', async () => {
      expect(await service.hasActivePlatformRole(500)).toBe(true);
    });

    it('faux pour un utilisateur sans rôle plateforme', async () => {
      expect(await service.hasActivePlatformRole(1000)).toBe(false);
    });

    it('faux pour un rôle plateforme expiré', async () => {
      expect(await service.hasActivePlatformRole(501)).toBe(false);
    });

    it('faux pour un rôle plateforme pas encore actif', async () => {
      expect(await service.hasActivePlatformRole(502)).toBe(false);
    });
  });

  describe('canEffective (union Member local + rôle plateforme)', () => {
    it("le rôle plateforme autorise même quand le Member local n'a aucun droit", async () => {
      // memberId 1000 : aucun MemberRole. userId 500 : Propriétaire (ALL).
      expect(
        await service.canEffective(500, 1000, 'READ', 'member', {
          clubId: 1,
          teamId: 5,
        }),
      ).toBe('ALL');
    });

    it('le Member local autorise même sans rôle plateforme', async () => {
      // memberId 42 (Marc, Coach TEAM sur l'U15) : userId 1000, aucun UserRole.
      expect(
        await service.canEffective(1000, 42, 'READ', 'member', {
          clubId: 1,
          teamId: 5,
        }),
      ).toBe('TEAM');
    });

    it('retient le scope le plus large entre Member local et rôle plateforme', async () => {
      // memberId 99 : AdminClub (CLUB). userId 500 : Propriétaire (ALL) — ALL l'emporte.
      expect(
        await service.canEffective(500, 99, 'READ', 'member', {
          clubId: 1,
          teamId: 5,
        }),
      ).toBe('ALL');
    });

    it('refuse quand ni le Member local ni un rôle plateforme ne donnent accès', async () => {
      expect(
        await service.canEffective(1000, 1000, 'READ', 'member', {
          clubId: 1,
          teamId: 5,
        }),
      ).toBeNull();
    });

    it("refuse proprement quand aucun Member n'existe (memberId null) et aucun rôle plateforme", async () => {
      expect(
        await service.canEffective(1000, null, 'READ', 'member', {
          clubId: 1,
          teamId: 5,
        }),
      ).toBeNull();
    });
  });
});
