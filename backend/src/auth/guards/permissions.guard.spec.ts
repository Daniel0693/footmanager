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
  let can: jest.Mock;
  let findByUserAndClub: jest.Mock;
  let guard: PermissionsGuard;

  beforeEach(() => {
    const reflector = new Reflector();
    reflectorGet = jest.spyOn(reflector, 'get');
    can = jest.fn();
    findByUserAndClub = jest.fn();
    guard = new PermissionsGuard(
      reflector,
      { can } as unknown as PermissionsService,
      { findByUserAndClub } as unknown as MembersService,
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

  it("refuse la requête si l'utilisateur n'a pas de Member dans ce club", async () => {
    reflectorGet.mockReturnValue({
      resource: 'player_profile',
      action: 'READ',
    });
    findByUserAndClub.mockResolvedValue(null);
    const request = {
      params: { clubId: '1' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request)),
    ).rejects.toBeInstanceOf(AppException);
    expect(findByUserAndClub).toHaveBeenCalledWith(7, 1);
  });

  it('refuse la requête si PermissionsService.can() ne renvoie aucun scope', async () => {
    reflectorGet.mockReturnValue({
      resource: 'player_profile',
      action: 'DELETE',
    });
    findByUserAndClub.mockResolvedValue(marc);
    can.mockResolvedValue(null);
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(
      guard.canActivate(buildContext(request)),
    ).rejects.toBeInstanceOf(AppException);
    expect(can).toHaveBeenCalledWith(42, 'DELETE', 'player_profile', {
      clubId: 1,
      teamId: 5,
    });
  });

  it('autorise et attache member + scope à la requête quand la permission est accordée', async () => {
    reflectorGet.mockReturnValue({
      resource: 'player_profile',
      action: 'READ',
    });
    findByUserAndClub.mockResolvedValue(marc);
    const scope: PermissionScope = 'TEAM';
    can.mockResolvedValue(scope);
    const request = {
      params: { clubId: '1', teamId: '5' },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(request.member).toBe(marc);
    expect(request.permissionScope).toBe('TEAM');
  });

  it('résout clubId/teamId depuis le body quand ils sont absents des params (ex. création)', async () => {
    reflectorGet.mockReturnValue({
      resource: 'player_profile',
      action: 'CREATE',
    });
    findByUserAndClub.mockResolvedValue(marc);
    can.mockResolvedValue('TEAM');
    const request = {
      params: {},
      body: { clubId: 1, teamId: 5 },
      user: { userId: 7 },
    } as Partial<PermissionedRequest>;

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(findByUserAndClub).toHaveBeenCalledWith(7, 1);
    expect(can).toHaveBeenCalledWith(42, 'CREATE', 'player_profile', {
      clubId: 1,
      teamId: 5,
    });
  });
});
