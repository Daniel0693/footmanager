import { HttpStatus } from '@nestjs/common';
import type { PermissionScope, Team } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  type PlayerMatchIdentity,
  RosterMatchingService,
} from './roster-matching.service';

const team: Team = {
  id: 5,
  clubId: 1,
  name: 'U15 A',
  category: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const otherTeam: Team = {
  id: 9,
  clubId: 1,
  name: 'U15 B',
  category: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    memberId: 42,
    licenseNumber: null,
    nationality: null,
    preferredFoot: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    member: {
      id: 42,
      firstName: 'Marc',
      lastName: 'Dupont',
      birthDate: new Date('2011-03-04'),
    },
    playerTeams: [],
    ...overrides,
  };
}

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: 200,
    playerId: 100,
    teamId: team.id,
    jerseyNumber: 9,
    mainPosition: 'ST',
    secondaryPositions: [],
    joinDate: new Date('2024-09-01'),
    leaveDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    team,
    ...overrides,
  };
}

describe('RosterMatchingService', () => {
  let teamFindFirst: jest.Mock;
  let profileFindMany: jest.Mock;
  let service: RosterMatchingService;

  beforeEach(() => {
    teamFindFirst = jest.fn().mockResolvedValue(team);
    profileFindMany = jest.fn().mockResolvedValue([]);

    const prismaStub = {
      team: { findFirst: teamFindFirst },
      playerProfile: { findMany: profileFindMany },
    } as unknown as PrismaService;

    service = new RosterMatchingService(prismaStub);
  });

  const baseIdentity: PlayerMatchIdentity = {
    firstName: 'Marc',
    lastName: 'Dupont',
    birthDate: null,
    licenseNumber: null,
  };

  // Scope CLUB par défaut (Coach/AdminClub) — les tests dédiés à OWN/PARENT
  // sont regroupés à part, voir plus bas.
  function findMatches(
    identity: PlayerMatchIdentity,
    scope: PermissionScope = 'CLUB',
  ) {
    return service.findMatches(1, 5, identity, scope);
  }

  describe('scope requis', () => {
    it.each(['OWN', 'PARENT'] as const)(
      'refuse un appelant en scope %s (outil de gestion réservé au staff)',
      async (scope) => {
        await expect(findMatches(baseIdentity, scope)).rejects.toMatchObject({
          status: HttpStatus.FORBIDDEN,
        });
        expect(teamFindFirst).not.toHaveBeenCalled();
        expect(profileFindMany).not.toHaveBeenCalled();
      },
    );

    it.each(['TEAM', 'CLUB', 'ALL'] as const)(
      'autorise un appelant en scope %s',
      async (scope) => {
        await expect(findMatches(baseIdentity, scope)).resolves.toEqual({
          status: 'NEW',
          candidates: [],
        });
      },
    );
  });

  it("refuse si l'équipe n'appartient pas au club", async () => {
    teamFindFirst.mockResolvedValue(null);

    await expect(findMatches(baseIdentity)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
    expect(profileFindMany).not.toHaveBeenCalled();
  });

  it("NOUVEAU : n'interroge aucun profil sans licence ni date de naissance", async () => {
    const result = await findMatches(baseIdentity);

    expect(result).toEqual({ status: 'NEW', candidates: [] });
    expect(profileFindMany).not.toHaveBeenCalled();
  });

  it('NOUVEAU : licence fournie mais aucun profil trouvé, pas de repli sans date de naissance', async () => {
    profileFindMany.mockResolvedValue([]);

    const result = await findMatches({
      ...baseIdentity,
      licenseNumber: 'CH-1234',
    });

    expect(result).toEqual({ status: 'NEW', candidates: [] });
    expect(profileFindMany).toHaveBeenCalledTimes(1);
    expect(profileFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { licenseNumber: 'CH-1234', member: { clubId: 1 } },
      }),
    );
  });

  it('NOUVEAU : repli nom+date de naissance sans résultat', async () => {
    profileFindMany.mockResolvedValue([]);

    const result = await findMatches({
      ...baseIdentity,
      birthDate: new Date('2011-03-04'),
    });

    expect(result).toEqual({ status: 'NEW', candidates: [] });
    expect(profileFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          member: {
            clubId: 1,
            firstName: { equals: 'Marc', mode: 'insensitive' },
            lastName: { equals: 'Dupont', mode: 'insensitive' },
            birthDate: new Date('2011-03-04'),
          },
        },
      }),
    );
  });

  it('la licence prend le pas sur le repli nom+date de naissance (cascade)', async () => {
    profileFindMany.mockResolvedValue([
      profile({ playerTeams: [assignment()] }),
    ]);

    await findMatches({
      ...baseIdentity,
      birthDate: new Date('2011-03-04'),
      licenseNumber: 'CH-1234',
    });

    expect(profileFindMany).toHaveBeenCalledTimes(1);
    expect(profileFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { licenseNumber: 'CH-1234', member: { clubId: 1 } },
      }),
    );
  });

  it('MODIFICATION : correspondance déjà active dans l’équipe ciblée', async () => {
    profileFindMany.mockResolvedValue([
      profile({ playerTeams: [assignment()] }),
    ]);

    const result = await findMatches({
      ...baseIdentity,
      licenseNumber: 'CH-1234',
    });

    expect(result.status).toBe('MODIFICATION');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].activeAssignmentInTeam).toMatchObject({
      id: 200,
      jerseyNumber: 9,
    });
    expect(result.candidates[0].activeTeamsElsewhere).toEqual([]);
  });

  it('RÉACTIVATION : retour dans la même équipe après un départ (préremplissage)', async () => {
    profileFindMany.mockResolvedValue([
      profile({
        playerTeams: [
          assignment({
            id: 201,
            jerseyNumber: 7,
            mainPosition: 'CDM',
            leaveDate: new Date('2025-06-30'),
          }),
        ],
      }),
    ]);

    const result = await findMatches({
      ...baseIdentity,
      licenseNumber: 'CH-1234',
    });

    expect(result.status).toBe('REACTIVATION');
    expect(result.candidates[0].activeAssignmentInTeam).toBeNull();
    expect(result.candidates[0].lastAssignment).toMatchObject({
      id: 201,
      jerseyNumber: 7,
      mainPosition: 'CDM',
    });
  });

  it('RÉACTIVATION : retient la plus récente parmi plusieurs affectations passées dans la même équipe', async () => {
    profileFindMany.mockResolvedValue([
      profile({
        playerTeams: [
          assignment({
            id: 201,
            jerseyNumber: 7,
            joinDate: new Date('2022-09-01'),
            leaveDate: new Date('2023-06-30'),
          }),
          assignment({
            id: 202,
            jerseyNumber: 11,
            joinDate: new Date('2024-09-01'),
            leaveDate: new Date('2025-06-30'),
          }),
        ],
      }),
    ]);

    const result = await findMatches({
      ...baseIdentity,
      licenseNumber: 'CH-1234',
    });

    expect(result.candidates[0].lastAssignment).toMatchObject({
      id: 202,
      jerseyNumber: 11,
    });
  });

  it('RÉACTIVATION : actif dans une autre équipe du même club — préremplit quand même depuis cette affectation (retour utilisateur 2026-07-16)', async () => {
    profileFindMany.mockResolvedValue([
      profile({
        playerTeams: [
          assignment({ id: 300, teamId: otherTeam.id, team: otherTeam }),
        ],
      }),
    ]);

    const result = await findMatches({
      ...baseIdentity,
      licenseNumber: 'CH-1234',
    });

    expect(result.status).toBe('REACTIVATION');
    expect(result.candidates[0].activeAssignmentInTeam).toBeNull();
    expect(result.candidates[0].lastAssignment).toMatchObject({
      id: 300,
      jerseyNumber: 9,
    });
    expect(result.candidates[0].activeTeamsElsewhere).toEqual([
      { teamId: otherTeam.id, teamName: otherTeam.name },
    ]);
  });

  it('RÉACTIVATION : sans aucune affectation passée, lastAssignment reste null', async () => {
    profileFindMany.mockResolvedValue([profile({ playerTeams: [] })]);

    const result = await findMatches({
      ...baseIdentity,
      licenseNumber: 'CH-1234',
    });

    expect(result.status).toBe('REACTIVATION');
    expect(result.candidates[0].lastAssignment).toBeNull();
  });

  it('AMBIGU : plusieurs candidats sur le repli nom+date de naissance', async () => {
    profileFindMany.mockResolvedValue([
      profile({ id: 100, memberId: 42 }),
      profile({ id: 101, memberId: 43 }),
    ]);

    const result = await findMatches({
      ...baseIdentity,
      birthDate: new Date('2011-03-04'),
    });

    expect(result.status).toBe('AMBIGUOUS');
    expect(result.candidates).toHaveLength(2);
  });
});
