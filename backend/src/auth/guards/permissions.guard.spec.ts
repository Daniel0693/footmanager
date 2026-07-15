import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Member, PermissionScope } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { MembersService } from '../../members/members.service';
import { PermissionsService } from '../../roles/permissions.service';
import { PermissionsGuard, PermissionedRequest } from './permissions.guard';

const marc: Member = {
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

const platformProvisionedMember: Member = {
  id: 999,
  userId: 7,
  clubId: 1,
  firstName: 'daniel',
  lastName: '(compte plateforme)',
  phone: null,
  avatarUrl: null,
  gender: null,
  birthDate: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function buildContext(request: Partial<PermissionedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  let reflectorGet: jest.SpyInstance;
  let canEffective: jest.Mock;
  let findByUserAndClub: jest.Mock;
  let resolveOrProvisionMember: jest.Mock;
  let guard: PermissionsGuard;

  beforeEach(() => {
    const reflector = new Reflector();
    reflectorGet = jest.spyOn(reflector, 'get');
    canEffective = jest.fn();
    findByUserAndClub = jest.fn();
    resolveOrProvisionMember = jest.fn();
    guard = new PermissionsGuard(
      reflector,
      { canEffective } as unknown as PermissionsService,
      {
        findByUserAndClub,
        resolveOrProvisionMember,
      } as unknown as MembersService,
    );
  });

  it('laisse passer une route sans permission déclarée (@RequirePermission absent)', async () => {
    reflectorGet.mockReturnValue(undefined);
    const request = {
      params: {},
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(findByUserAndClub).not.toHaveBeenCalled();
  });

  it("refuse la requête si aucun clubId n'est résolvable (params/body/query)", async () => {
    reflectorGet.mockReturnValue({
      resource: 'player_profile',
      action: 'READ',
    });
    const request = {
      params: {},
      body: {},
      query: {},
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request)),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
  });

  it('refuse la requête si ni le Member local ni un rôle plateforme ne donnent de scope (aucun Member, aucun UserRole)', async () => {
    reflectorGet.mockReturnValue({
      resource: 'player_profile',
      action: 'READ',
    });
    findByUserAndClub.mockResolvedValue(null);
    canEffective.mockResolvedValue(null);
    const request = {
      params: { clubId: '1' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request)),
    ).rejects.toBeInstanceOf(AppException);
    expect(findByUserAndClub).toHaveBeenCalledWith(7, 1);
    expect(canEffective).toHaveBeenCalledWith(
      7,
      null,
      'READ',
      'player_profile',
      {
        clubId: 1,
        teamId: undefined,
      },
    );
    // Jamais de provisioning pour un utilisateur sans droit — il ne doit
    // jamais pouvoir créer un Member en sondant des clubId arbitraires.
    expect(resolveOrProvisionMember).not.toHaveBeenCalled();
  });

  it('refuse la requête si PermissionsService.canEffective() ne renvoie aucun scope (Member existant mais sans droit)', async () => {
    reflectorGet.mockReturnValue({
      resource: 'player_profile',
      action: 'DELETE',
    });
    findByUserAndClub.mockResolvedValue(marc);
    canEffective.mockResolvedValue(null);
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request)),
    ).rejects.toBeInstanceOf(AppException);
    expect(canEffective).toHaveBeenCalledWith(
      7,
      42,
      'DELETE',
      'player_profile',
      { clubId: 1, teamId: 5 },
    );
    expect(resolveOrProvisionMember).not.toHaveBeenCalled();
  });

  it('autorise et attache member + scope à la requête quand la permission est accordée via le Member local', async () => {
    reflectorGet.mockReturnValue({
      resource: 'player_profile',
      action: 'READ',
    });
    findByUserAndClub.mockResolvedValue(marc);
    const scope: PermissionScope = 'TEAM';
    canEffective.mockResolvedValue(scope);
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(request.member).toBe(marc);
    expect(request.permissionScope).toBe('TEAM');
    // Un Member existait déjà — aucun provisioning nécessaire.
    expect(resolveOrProvisionMember).not.toHaveBeenCalled();
  });

  it("autorise, provisionne et attache un Member quand l'accès ne vient que d'un rôle plateforme (aucun Member préexistant)", async () => {
    reflectorGet.mockReturnValue({
      resource: 'player_profile',
      action: 'READ',
    });
    findByUserAndClub.mockResolvedValue(null);
    canEffective.mockResolvedValue('ALL');
    resolveOrProvisionMember.mockResolvedValue(platformProvisionedMember);
    const request = {
      params: { clubId: '1' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(canEffective).toHaveBeenCalledWith(
      7,
      null,
      'READ',
      'player_profile',
      {
        clubId: 1,
        teamId: undefined,
      },
    );
    expect(resolveOrProvisionMember).toHaveBeenCalledWith(7, 1);
    expect(request.member).toBe(platformProvisionedMember);
    expect(request.permissionScope).toBe('ALL');
  });

  it('résout clubId/teamId depuis le body quand ils sont absents des params (ex. création)', async () => {
    reflectorGet.mockReturnValue({
      resource: 'player_profile',
      action: 'CREATE',
    });
    findByUserAndClub.mockResolvedValue(marc);
    canEffective.mockResolvedValue('TEAM');
    const request = {
      params: {},
      body: { clubId: 1, teamId: 5 },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(findByUserAndClub).toHaveBeenCalledWith(7, 1);
    expect(canEffective).toHaveBeenCalledWith(
      7,
      42,
      'CREATE',
      'player_profile',
      { clubId: 1, teamId: 5 },
    );
  });
});
