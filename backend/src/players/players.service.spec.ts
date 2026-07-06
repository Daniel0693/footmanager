import { HttpStatus } from '@nestjs/common';
import type { Member, PlayerProfile } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { MembersService } from '../members/members.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlayersService } from './players.service';

const marcMember: Member = {
  id: 42,
  userId: 7,
  clubId: 1,
  firstName: 'Marc',
  lastName: 'Dupont',
  phone: null,
  avatarUrl: null,
  gender: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const marcProfile: PlayerProfile = {
  id: 100,
  memberId: 42,
  licenseNumber: null,
  nationality: null,
  birthDate: null,
  preferredFoot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PlayersService', () => {
  let memberFindUnique: jest.Mock;
  let profileFindUnique: jest.Mock;
  let profileFindFirst: jest.Mock;
  let profileFindMany: jest.Mock;
  let profileCreate: jest.Mock;
  let profileUpdate: jest.Mock;
  let profileDelete: jest.Mock;
  let playerTeamFindFirst: jest.Mock;
  let findByUserAndClub: jest.Mock;
  let service: PlayersService;

  beforeEach(() => {
    memberFindUnique = jest.fn();
    profileFindUnique = jest.fn();
    profileFindFirst = jest.fn();
    profileFindMany = jest.fn();
    profileCreate = jest.fn();
    profileUpdate = jest.fn();
    profileDelete = jest.fn();
    playerTeamFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    findByUserAndClub = jest.fn();

    const prismaStub = {
      member: { findUnique: memberFindUnique },
      playerProfile: {
        findUnique: profileFindUnique,
        findFirst: profileFindFirst,
        findMany: profileFindMany,
        create: profileCreate,
        update: profileUpdate,
        delete: profileDelete,
      },
      playerTeam: { findFirst: playerTeamFindFirst },
    } as unknown as PrismaService;
    const membersServiceStub = {
      findByUserAndClub,
    } as unknown as MembersService;

    service = new PlayersService(prismaStub, membersServiceStub);
  });

  describe('create', () => {
    it("refuse si le Member ciblé n'appartient pas au club", async () => {
      memberFindUnique.mockResolvedValue({ ...marcMember, clubId: 2 });

      await expect(service.create(1, { memberId: 42 })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      expect(profileCreate).not.toHaveBeenCalled();
    });

    it('refuse si le Member a déjà un profil joueur', async () => {
      memberFindUnique.mockResolvedValue(marcMember);
      profileFindUnique.mockResolvedValue(marcProfile);

      await expect(service.create(1, { memberId: 42 })).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
      expect(profileCreate).not.toHaveBeenCalled();
    });

    it('crée le profil quand le Member est du club et sans profil existant', async () => {
      memberFindUnique.mockResolvedValue(marcMember);
      profileFindUnique.mockResolvedValue(null);
      profileCreate.mockResolvedValue(marcProfile);

      const result = await service.create(1, {
        memberId: 42,
        nationality: 'FR',
      });

      expect(result).toBe(marcProfile);
      expect(profileCreate).toHaveBeenCalledWith({
        data: {
          memberId: 42,
          licenseNumber: undefined,
          nationality: 'FR',
          birthDate: undefined,
          preferredFoot: undefined,
        },
      });
    });

    it('crée le profil avec le pied fort renseigné', async () => {
      memberFindUnique.mockResolvedValue(marcMember);
      profileFindUnique.mockResolvedValue(null);
      profileCreate.mockResolvedValue({
        ...marcProfile,
        preferredFoot: 'LEFT',
      });

      await service.create(1, { memberId: 42, preferredFoot: 'LEFT' });

      expect(profileCreate).toHaveBeenCalledWith({
        data: {
          memberId: 42,
          licenseNumber: undefined,
          nationality: undefined,
          birthDate: undefined,
          preferredFoot: 'LEFT',
        },
      });
    });
  });

  describe('findMe', () => {
    it("refuse si l'appelant n'est pas Member de ce club", async () => {
      findByUserAndClub.mockResolvedValue(null);

      await expect(service.findMe(1, 7)).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
      });
    });

    it("renvoie 404 si le membre n'a pas encore de profil joueur", async () => {
      findByUserAndClub.mockResolvedValue(marcMember);
      profileFindUnique.mockResolvedValue(null);

      await expect(service.findMe(1, 7)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('renvoie le profil du membre résolu depuis userId+clubId', async () => {
      findByUserAndClub.mockResolvedValue(marcMember);
      profileFindUnique.mockResolvedValue(marcProfile);

      await expect(service.findMe(1, 7)).resolves.toBe(marcProfile);
      expect(findByUserAndClub).toHaveBeenCalledWith(7, 1);
      expect(profileFindUnique).toHaveBeenCalledWith({
        where: { memberId: 42 },
      });
    });
  });

  describe('findAllByClub', () => {
    it('scope OWN : ne renvoie que le profil du membre appelant', async () => {
      profileFindFirst.mockResolvedValue(marcProfile);

      const result = await service.findAllByClub(1, {
        memberId: 42,
        scope: 'OWN',
      });

      expect(result).toEqual([marcProfile]);
      expect(profileFindMany).not.toHaveBeenCalled();
    });

    it("scope OWN sans profil : renvoie une liste vide plutôt qu'un 404", async () => {
      profileFindFirst.mockResolvedValue(null);

      const result = await service.findAllByClub(1, {
        memberId: 42,
        scope: 'OWN',
      });

      expect(result).toEqual([]);
    });

    it('scope CLUB : renvoie tous les profils du club', async () => {
      profileFindMany.mockResolvedValue([marcProfile]);

      const result = await service.findAllByClub(1, {
        memberId: 99,
        scope: 'CLUB',
      });

      expect(result).toEqual([marcProfile]);
      expect(profileFindFirst).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('renvoie 404 si le profil est introuvable dans ce club', async () => {
      profileFindFirst.mockResolvedValue(null);

      await expect(
        service.findOne(1, 100, { memberId: 42, scope: 'OWN' }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it("scope OWN : refuse l'accès au profil d'un autre membre (403)", async () => {
      profileFindFirst.mockResolvedValue(marcProfile);

      await expect(
        service.findOne(1, 100, { memberId: 1000, scope: 'OWN' }),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('scope OWN : autorise la lecture de son propre profil', async () => {
      profileFindFirst.mockResolvedValue(marcProfile);

      await expect(
        service.findOne(1, 100, { memberId: 42, scope: 'OWN' }),
      ).resolves.toBe(marcProfile);
    });

    it("scope CLUB : autorise la lecture même si ce n'est pas son propre profil", async () => {
      profileFindFirst.mockResolvedValue(marcProfile);

      await expect(
        service.findOne(1, 100, { memberId: 99, scope: 'CLUB' }),
      ).resolves.toBe(marcProfile);
    });

    it('scope TEAM : autorise la lecture si le joueur appartient à cette équipe', async () => {
      profileFindFirst.mockResolvedValue(marcProfile);
      playerTeamFindFirst.mockResolvedValue({
        id: 1,
        playerId: 100,
        teamId: 8,
      });

      await expect(
        service.findOne(1, 100, { memberId: 43, scope: 'TEAM', teamId: 8 }),
      ).resolves.toBe(marcProfile);
      expect(playerTeamFindFirst).toHaveBeenCalledWith({
        where: { playerId: 100, teamId: 8, leaveDate: null },
      });
    });

    it("scope TEAM : refuse la lecture d'un joueur qui n'appartient pas à cette équipe (faille A7.3)", async () => {
      profileFindFirst.mockResolvedValue(marcProfile);
      playerTeamFindFirst.mockResolvedValue(null);

      await expect(
        service.findOne(1, 100, { memberId: 43, scope: 'TEAM', teamId: 8 }),
      ).rejects.toBeInstanceOf(AppException);
    });
  });

  describe('update', () => {
    it('renvoie 404 si le profil est introuvable dans ce club', async () => {
      profileFindFirst.mockResolvedValue(null);

      await expect(
        service.update(
          1,
          100,
          { nationality: 'BE' },
          { memberId: 99, scope: 'CLUB' },
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(profileUpdate).not.toHaveBeenCalled();
    });

    it('met à jour le profil trouvé dans ce club', async () => {
      profileFindFirst.mockResolvedValue(marcProfile);
      profileUpdate.mockResolvedValue({ ...marcProfile, nationality: 'BE' });

      const result = await service.update(
        1,
        100,
        { nationality: 'BE' },
        { memberId: 99, scope: 'CLUB' },
      );

      expect(result.nationality).toBe('BE');
      expect(profileUpdate).toHaveBeenCalledWith({
        where: { id: 100 },
        data: {
          licenseNumber: undefined,
          nationality: 'BE',
          birthDate: undefined,
          preferredFoot: undefined,
        },
      });
    });

    it('met à jour le pied fort du profil', async () => {
      profileFindFirst.mockResolvedValue(marcProfile);
      profileUpdate.mockResolvedValue({
        ...marcProfile,
        preferredFoot: 'RIGHT',
      });

      const result = await service.update(
        1,
        100,
        { preferredFoot: 'RIGHT' },
        { memberId: 99, scope: 'CLUB' },
      );

      expect(result.preferredFoot).toBe('RIGHT');
      expect(profileUpdate).toHaveBeenCalledWith({
        where: { id: 100 },
        data: {
          licenseNumber: undefined,
          nationality: undefined,
          birthDate: undefined,
          preferredFoot: 'RIGHT',
        },
      });
    });

    it("scope TEAM : refuse la modification d'un joueur qui n'appartient pas à cette équipe (faille A7.3)", async () => {
      profileFindFirst.mockResolvedValue(marcProfile);
      playerTeamFindFirst.mockResolvedValue(null);

      await expect(
        service.update(
          1,
          100,
          { nationality: 'BE' },
          { memberId: 43, scope: 'TEAM', teamId: 8 },
        ),
      ).rejects.toBeInstanceOf(AppException);
      expect(profileUpdate).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('renvoie 404 si le profil est introuvable dans ce club', async () => {
      profileFindFirst.mockResolvedValue(null);

      await expect(
        service.remove(1, 100, { memberId: 99, scope: 'CLUB' }),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      expect(profileDelete).not.toHaveBeenCalled();
    });

    it('supprime le profil trouvé dans ce club', async () => {
      profileFindFirst.mockResolvedValue(marcProfile);

      await service.remove(1, 100, { memberId: 99, scope: 'CLUB' });

      expect(profileDelete).toHaveBeenCalledWith({ where: { id: 100 } });
    });

    it("scope TEAM : refuse la suppression d'un joueur qui n'appartient pas à cette équipe (faille A7.3)", async () => {
      profileFindFirst.mockResolvedValue(marcProfile);
      playerTeamFindFirst.mockResolvedValue(null);

      await expect(
        service.remove(1, 100, { memberId: 43, scope: 'TEAM', teamId: 8 }),
      ).rejects.toBeInstanceOf(AppException);
      expect(profileDelete).not.toHaveBeenCalled();
    });
  });
});
