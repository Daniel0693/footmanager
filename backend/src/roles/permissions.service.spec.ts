import { PermissionsService } from './permissions.service';

/**
 * Fixtures reproduisant le scénario multi-rôles de référence de
 * docs/modules/auth-roles.md ("Marc est Coach de l'équipe U15 (Club A), Player
 * dans l'équipe Seniors (Club A), et Parent d'un joueur dans l'équipe U10 (Club B)").
 */

const permissions = {
  memberReadTeam: { id: 1, resource: 'member', action: 'READ', scope: 'TEAM' },
  memberUpdateTeam: { id: 2, resource: 'member', action: 'UPDATE', scope: 'TEAM' },
  memberReadOwn: { id: 3, resource: 'member', action: 'READ', scope: 'OWN' },
  memberReadClub: { id: 4, resource: 'member', action: 'READ', scope: 'CLUB' },
  memberDeleteClub: { id: 5, resource: 'member', action: 'DELETE', scope: 'CLUB' },
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
    { memberId: 42, clubId: 1, teamId: 5, startDate: null, endDate: null, role: roles.coach },
    { memberId: 42, clubId: 1, teamId: 8, startDate: null, endDate: null, role: roles.player },
    { memberId: 42, clubId: 2, teamId: 12, startDate: null, endDate: null, role: roles.parent },
  ],
  99: [
    { memberId: 99, clubId: 1, teamId: null, startDate: null, endDate: null, role: roles.adminClub },
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

function buildPrismaStub() {
  return {
    memberRole: {
      findMany: jest.fn(({ where: { memberId } }: { where: { memberId: number } }) =>
        Promise.resolve(memberRolesByMember[memberId] ?? []),
      ),
    },
  };
}

describe('PermissionsService', () => {
  let service: PermissionsService;

  beforeEach(() => {
    service = new PermissionsService(buildPrismaStub() as any);
  });

  it('refuse tout accès à un membre sans aucun rôle', async () => {
    const result = await service.can(1000, 'READ', 'member', { clubId: 1, teamId: 5 });
    expect(result).toBeNull();
  });

  it("un rôle système (Coach) fait exactement ce qu'il doit dans son équipe", async () => {
    expect(await service.can(42, 'READ', 'member', { clubId: 1, teamId: 5 })).toBe('TEAM');
    expect(await service.can(42, 'UPDATE', 'member', { clubId: 1, teamId: 5 })).toBe('TEAM');
    // Le Coach n'a pas la permission DELETE, quel que soit le scope.
    expect(await service.can(42, 'DELETE', 'member', { clubId: 1, teamId: 5 })).toBeNull();
  });

  it("un rôle scopé à l'équipe A ne donne aucun accès à l'équipe B du même club", async () => {
    // MemberRole Coach de Marc est scopé teamId=5 uniquement.
    const result = await service.can(42, 'READ', 'member', { clubId: 1, teamId: 6 });
    expect(result).toBeNull();
  });

  it('scénario multi-rôles (Marc) : trois rôles, trois contextes, trois jeux de droits', async () => {
    // Coach de l'U15 (Club A)
    expect(await service.can(42, 'READ', 'member', { clubId: 1, teamId: 5 })).toBe('TEAM');
    // Player en Seniors (Club A) — accès à ses propres données uniquement
    expect(await service.can(42, 'READ', 'member', { clubId: 1, teamId: 8 })).toBe('OWN');
    // Parent dans l'U10 (Club B) — accès à ses propres données uniquement
    expect(await service.can(42, 'READ', 'member', { clubId: 2, teamId: 12 })).toBe('OWN');
    // Aucune fuite du rôle Parent vers une autre équipe du Club B
    expect(await service.can(42, 'READ', 'member', { clubId: 2, teamId: 99 })).toBeNull();
    // Aucune fuite d'un rôle du Club A vers le Club B
    expect(await service.can(42, 'READ', 'member', { clubId: 2, teamId: 5 })).toBeNull();
  });

  it('un rôle scopé club entier (AdminClub, teamId=null) couvre toutes les équipes du club', async () => {
    expect(await service.can(99, 'READ', 'member', { clubId: 1, teamId: 5 })).toBe('CLUB');
    expect(await service.can(99, 'DELETE', 'member', { clubId: 1, teamId: 8 })).toBe('CLUB');
    // Mais pas un autre club.
    expect(await service.can(99, 'READ', 'member', { clubId: 2, teamId: 1 })).toBeNull();
  });

  it('un rôle personnalisé avec permissions limitées respecte ces limites', async () => {
    expect(await service.can(7, 'READ', 'member', { clubId: 1, teamId: 5 })).toBe('TEAM');
    // Physiotherapeute n'a pas la permission UPDATE sur member.
    expect(await service.can(7, 'UPDATE', 'member', { clubId: 1, teamId: 5 })).toBeNull();
  });
});
