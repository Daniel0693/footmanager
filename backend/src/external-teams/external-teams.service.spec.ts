import { HttpStatus } from '@nestjs/common';
import type { ExternalTeam } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { ExternalTeamsService } from './external-teams.service';

const externalTeam: ExternalTeam = {
  id: 100,
  clubId: 1,
  name: 'FC Rivaux',
  city: 'Genève',
  country: 'Suisse',
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ExternalTeamsService', () => {
  let externalTeamFindFirst: jest.Mock;
  let externalTeamFindMany: jest.Mock;
  let externalTeamCreate: jest.Mock;
  let externalTeamUpdate: jest.Mock;
  let externalTeamDelete: jest.Mock;
  let permissionsCan: jest.Mock;
  let service: ExternalTeamsService;

  beforeEach(() => {
    externalTeamFindFirst = jest.fn();
    externalTeamFindMany = jest.fn();
    externalTeamCreate = jest.fn();
    externalTeamUpdate = jest.fn();
    externalTeamDelete = jest.fn();

    const prismaStub = {
      externalTeam: {
        findFirst: externalTeamFindFirst,
        findMany: externalTeamFindMany,
        create: externalTeamCreate,
        update: externalTeamUpdate,
        delete: externalTeamDelete,
      },
    } as unknown as PrismaService;

    permissionsCan = jest.fn().mockResolvedValue('TEAM');
    const permissionsStub = { can: permissionsCan } as unknown as PermissionsService;

    service = new ExternalTeamsService(prismaStub, permissionsStub);
  });

  describe('create', () => {
    it('crée une équipe adverse pour le club', async () => {
      externalTeamCreate.mockResolvedValue(externalTeam);

      const result = await service.create(1, {
        name: 'FC Rivaux',
        city: 'Genève',
        country: 'Suisse',
      });

      expect(result).toBe(externalTeam);
      expect(externalTeamCreate).toHaveBeenCalledWith({
        data: {
          clubId: 1,
          name: 'FC Rivaux',
          city: 'Genève',
          country: 'Suisse',
          notes: undefined,
        },
      });
    });
  });

  describe('findAllByClub', () => {
    it('liste les équipes adverses du club, triées par nom', async () => {
      externalTeamFindMany.mockResolvedValue([externalTeam]);

      const result = await service.findAllByClub(1, 42, 5);

      expect(result).toEqual({ data: [externalTeam], canManage: true });
      expect(externalTeamFindMany).toHaveBeenCalledWith({
        where: { clubId: 1 },
        orderBy: { name: 'asc' },
      });
    });

    it('canManage reflète CREATE sur `external_team`, teamId transmis (Coach TEAM)', async () => {
      externalTeamFindMany.mockResolvedValue([]);
      permissionsCan.mockResolvedValue(null);

      const result = await service.findAllByClub(1, 42, 5);

      expect(permissionsCan).toHaveBeenCalledWith(42, 'CREATE', 'external_team', {
        clubId: 1,
        teamId: 5,
      });
      expect(result.canManage).toBe(false);
    });

    it('canManage fonctionne sans teamId (AdminClub, scope CLUB)', async () => {
      externalTeamFindMany.mockResolvedValue([]);

      const result = await service.findAllByClub(1, 99);

      expect(permissionsCan).toHaveBeenCalledWith(99, 'CREATE', 'external_team', {
        clubId: 1,
        teamId: undefined,
      });
      expect(result.canManage).toBe(true);
    });
  });

  describe('findOne', () => {
    it('renvoie 404 si l’équipe adverse est introuvable dans ce club', async () => {
      externalTeamFindFirst.mockResolvedValue(null);

      await expect(service.findOne(1, 100)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('retourne l’équipe adverse trouvée', async () => {
      externalTeamFindFirst.mockResolvedValue(externalTeam);

      await expect(service.findOne(1, 100)).resolves.toBe(externalTeam);
      expect(externalTeamFindFirst).toHaveBeenCalledWith({
        where: { id: 100, clubId: 1 },
      });
    });
  });

  describe('update', () => {
    it('renvoie 404 si l’équipe adverse est introuvable', async () => {
      externalTeamFindFirst.mockResolvedValue(null);

      await expect(
        service.update(1, 100, { name: 'Nouveau nom' }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(externalTeamUpdate).not.toHaveBeenCalled();
    });

    it('modifie une équipe adverse existante', async () => {
      externalTeamFindFirst.mockResolvedValue(externalTeam);
      externalTeamUpdate.mockResolvedValue({
        ...externalTeam,
        name: 'Nouveau nom',
      });

      const result = await service.update(1, 100, { name: 'Nouveau nom' });

      expect(result.name).toBe('Nouveau nom');
      expect(externalTeamUpdate).toHaveBeenCalledWith({
        where: { id: 100 },
        data: {
          name: 'Nouveau nom',
          city: undefined,
          country: undefined,
          notes: undefined,
        },
      });
    });
  });

  describe('remove', () => {
    it('renvoie 404 si l’équipe adverse est introuvable', async () => {
      externalTeamFindFirst.mockResolvedValue(null);

      await expect(service.remove(1, 100)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      expect(externalTeamDelete).not.toHaveBeenCalled();
    });

    it('supprime une équipe adverse existante', async () => {
      externalTeamFindFirst.mockResolvedValue(externalTeam);

      await service.remove(1, 100);

      expect(externalTeamDelete).toHaveBeenCalledWith({ where: { id: 100 } });
    });
  });
});
