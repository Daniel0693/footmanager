import { HttpStatus } from '@nestjs/common';
import type {
  Championship,
  ChampionshipParticipant,
  ExternalTeam,
  Team,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { ChampionshipParticipantsService } from './championship-participants.service';

const team: Team = {
  id: 5,
  clubId: 1,
  name: 'U15',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const championship: Championship = {
  id: 100,
  seasonId: 10,
  teamId: 5,
  name: 'Championnat Automne',
  startDate: new Date('2026-09-01'),
  endDate: new Date('2026-12-15'),
  pointsForWin: 3,
  pointsForDraw: 1,
  pointsForLoss: 0,
  tiebreakerRules: ['GOAL_DIFFERENCE'],
  tiebreakerPreset: null,
  numberOfPeriods: 2,
  periodDurationMinutes: 45,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const externalTeam: ExternalTeam = {
  id: 50,
  clubId: 1,
  name: 'FC Rivaux',
  city: null,
  country: null,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const participant: ChampionshipParticipant = {
  id: 900,
  championshipId: 100,
  internalTeamId: null,
  externalTeamId: 50,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ChampionshipParticipantsService', () => {
  let teamFindFirst: jest.Mock;
  let championshipFindFirst: jest.Mock;
  let externalTeamFindFirst: jest.Mock;
  let participantFindFirst: jest.Mock;
  let participantFindMany: jest.Mock;
  let participantCreate: jest.Mock;
  let participantDelete: jest.Mock;
  let permissionsCan: jest.Mock;
  let service: ChampionshipParticipantsService;

  beforeEach(() => {
    teamFindFirst = jest.fn().mockResolvedValue(team);
    championshipFindFirst = jest.fn().mockResolvedValue(championship);
    externalTeamFindFirst = jest.fn().mockResolvedValue(externalTeam);
    participantFindFirst = jest.fn().mockResolvedValue(null);
    participantFindMany = jest.fn();
    participantCreate = jest.fn();
    participantDelete = jest.fn();

    const prismaStub = {
      team: { findFirst: teamFindFirst },
      championship: { findFirst: championshipFindFirst },
      externalTeam: { findFirst: externalTeamFindFirst },
      championshipParticipant: {
        findFirst: participantFindFirst,
        findMany: participantFindMany,
        create: participantCreate,
        delete: participantDelete,
      },
    } as unknown as PrismaService;

    permissionsCan = jest.fn().mockResolvedValue('TEAM');
    const permissionsStub = {
      can: permissionsCan,
    } as unknown as PermissionsService;

    service = new ChampionshipParticipantsService(prismaStub, permissionsStub);
  });

  describe('create', () => {
    it('ajoute une équipe adverse comme participante', async () => {
      participantCreate.mockResolvedValue(participant);

      const result = await service.create(1, 5, 100, { externalTeamId: 50 });

      expect(result).toBe(participant);
      expect(participantCreate).toHaveBeenCalledWith({
        data: {
          championshipId: 100,
          internalTeamId: undefined,
          externalTeamId: 50,
        },
        include: {
          internalTeam: { select: { id: true, name: true } },
          externalTeam: { select: { id: true, name: true } },
        },
      });
    });

    it("ajoute l'équipe propriétaire (internalTeamId === teamId de l'URL)", async () => {
      participantCreate.mockResolvedValue({
        ...participant,
        internalTeamId: 5,
        externalTeamId: null,
      });

      await service.create(1, 5, 100, { internalTeamId: 5 });

      expect(participantCreate).toHaveBeenCalledWith({
        data: {
          championshipId: 100,
          internalTeamId: 5,
          externalTeamId: undefined,
        },
        include: {
          internalTeam: { select: { id: true, name: true } },
          externalTeam: { select: { id: true, name: true } },
        },
      });
    });

    it('refuse si ni internalTeamId ni externalTeamId ne sont transmis', async () => {
      await expect(service.create(1, 5, 100, {})).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      expect(participantCreate).not.toHaveBeenCalled();
    });

    it('refuse si les deux sont transmis', async () => {
      await expect(
        service.create(1, 5, 100, { internalTeamId: 5, externalTeamId: 50 }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(participantCreate).not.toHaveBeenCalled();
    });

    it("refuse un internalTeamId différent de l'équipe propriétaire du championnat (limite MVP)", async () => {
      await expect(
        service.create(1, 5, 100, { internalTeamId: 6 }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(participantCreate).not.toHaveBeenCalled();
    });

    it('refuse une équipe adverse hors du club', async () => {
      externalTeamFindFirst.mockResolvedValue(null);

      await expect(
        service.create(1, 5, 100, { externalTeamId: 999 }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(participantCreate).not.toHaveBeenCalled();
    });

    it('refuse un doublon (même équipe déjà participante)', async () => {
      participantFindFirst.mockResolvedValue(participant);

      await expect(
        service.create(1, 5, 100, { externalTeamId: 50 }),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
      expect(participantCreate).not.toHaveBeenCalled();
    });

    it('refuse si le championnat est introuvable dans cette équipe', async () => {
      championshipFindFirst.mockResolvedValue(null);

      await expect(
        service.create(1, 5, 999, { externalTeamId: 50 }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(participantCreate).not.toHaveBeenCalled();
    });
  });

  describe('findAllByChampionship', () => {
    it('liste les participants avec le flag canManage', async () => {
      participantFindMany.mockResolvedValue([participant]);

      const result = await service.findAllByChampionship(1, 5, 100, 42);

      expect(result).toEqual({ data: [participant], canManage: true });
      expect(participantFindMany).toHaveBeenCalledWith({
        where: { championshipId: 100 },
        include: {
          internalTeam: { select: { id: true, name: true } },
          externalTeam: { select: { id: true, name: true } },
        },
        orderBy: { id: 'asc' },
      });
    });

    it('canManage reflète CREATE sur `championship_participant` (Player en lecture seule)', async () => {
      participantFindMany.mockResolvedValue([]);
      permissionsCan.mockResolvedValue(null);

      const result = await service.findAllByChampionship(1, 5, 100, 42);

      expect(permissionsCan).toHaveBeenCalledWith(
        42,
        'CREATE',
        'championship_participant',
        { clubId: 1, teamId: 5 },
      );
      expect(result.canManage).toBe(false);
    });
  });

  describe('remove', () => {
    it('renvoie 404 si le participant est introuvable', async () => {
      participantFindFirst.mockResolvedValue(null);

      await expect(service.remove(1, 5, 100, 900)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      expect(participantDelete).not.toHaveBeenCalled();
    });

    it('supprime un participant existant', async () => {
      participantFindFirst.mockResolvedValue(participant);

      await service.remove(1, 5, 100, 900);

      expect(participantDelete).toHaveBeenCalledWith({ where: { id: 900 } });
    });
  });
});
