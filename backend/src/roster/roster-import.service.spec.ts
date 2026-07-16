import { HttpStatus } from '@nestjs/common';
import type { Team } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_IMPORT_ROWS, RosterImportService } from './roster-import.service';
import { RosterMatchingService } from './roster-matching.service';

async function buildXlsxBuffer(rows: (string | Date)[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Import');
  rows.forEach((row) => sheet.addRow(row));
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function csvBuffer(content: string): Buffer {
  return Buffer.from(content, 'utf-8');
}

const team: Team = {
  id: 5,
  clubId: 1,
  name: 'U15 A',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('RosterImportService', () => {
  let service: RosterImportService;
  let teamFindFirst: jest.Mock;
  let findMatchesForRow: jest.Mock;

  beforeEach(() => {
    teamFindFirst = jest.fn().mockResolvedValue(team);
    findMatchesForRow = jest.fn().mockResolvedValue({
      status: 'NEW',
      candidates: [],
    });
    const prismaStub = {
      team: { findFirst: teamFindFirst },
    } as unknown as PrismaService;
    const rosterMatchingServiceStub = {
      findMatchesForRow,
    } as unknown as RosterMatchingService;

    service = new RosterImportService(prismaStub, rosterMatchingServiceStub);
  });

  it('parse un fichier XLSX en en-têtes + lignes', async () => {
    const buffer = await buildXlsxBuffer([
      ['Prénom', 'Nom', 'Date de naissance'],
      ['Alice', 'Dupont', '2012-04-01'],
      ['Bob', 'Martin', '2011-09-15'],
    ]);

    const result = await service.parseFile({
      originalname: 'joueurs.xlsx',
      buffer,
    });

    expect(result.headers).toEqual(['Prénom', 'Nom', 'Date de naissance']);
    expect(result.rows).toEqual([
      ['Alice', 'Dupont', '2012-04-01'],
      ['Bob', 'Martin', '2011-09-15'],
    ]);
  });

  it('parse un fichier CSV en en-têtes + lignes', async () => {
    const buffer = csvBuffer('Prénom,Nom\nAlice,Dupont\nBob,Martin\n');

    const result = await service.parseFile({
      originalname: 'joueurs.csv',
      buffer,
    });

    expect(result.headers).toEqual(['Prénom', 'Nom']);
    expect(result.rows).toEqual([
      ['Alice', 'Dupont'],
      ['Bob', 'Martin'],
    ]);
  });

  it('convertit une cellule date XLSX en AAAA-MM-JJ (date locale)', async () => {
    const buffer = await buildXlsxBuffer([
      ['Prénom', 'Date de naissance'],
      ['Alice', new Date(2012, 3, 1)],
    ]);

    const result = await service.parseFile({
      originalname: 'joueurs.xlsx',
      buffer,
    });

    expect(result.rows).toEqual([['Alice', '2012-04-01']]);
  });

  it('rejette un type de fichier non supporté', async () => {
    await expect(
      service.parseFile({
        originalname: 'joueurs.txt',
        buffer: Buffer.from('x'),
      }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });

  it('rejette un fichier vide (aucune ligne)', async () => {
    const buffer = await buildXlsxBuffer([]);

    await expect(
      service.parseFile({ originalname: 'vide.xlsx', buffer }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });

  it('rejette un fichier dépassant la limite de lignes', async () => {
    const header = ['Prénom', 'Nom'];
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => [
      `Joueur${i}`,
      'Test',
    ]);
    const buffer = await buildXlsxBuffer([header, ...rows]);

    await expect(
      service.parseFile({ originalname: 'trop-long.xlsx', buffer }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });

  describe('previewImport', () => {
    const rows = [
      {
        firstName: 'Alice',
        lastName: 'Dupont',
        birthDate: new Date('2012-04-01'),
      },
      { firstName: 'Bob', lastName: 'Martin', licenseNumber: 'CH-1234' },
    ];

    it.each(['OWN', 'PARENT'] as const)(
      'refuse un appelant en scope %s (outil de gestion réservé au staff)',
      async (scope) => {
        await expect(
          service.previewImport(1, 5, rows, scope),
        ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
        expect(teamFindFirst).not.toHaveBeenCalled();
        expect(findMatchesForRow).not.toHaveBeenCalled();
      },
    );

    it("refuse si l'équipe n'appartient pas au club", async () => {
      teamFindFirst.mockResolvedValue(null);

      await expect(
        service.previewImport(1, 5, rows, 'CLUB'),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(findMatchesForRow).not.toHaveBeenCalled();
    });

    it('vérifie le scope/équipe une seule fois puis rapproche chaque ligne, en conservant son index', async () => {
      findMatchesForRow
        .mockResolvedValueOnce({ status: 'NEW', candidates: [] })
        .mockResolvedValueOnce({
          status: 'REACTIVATION',
          candidates: [{ playerId: 7 }],
        });

      const result = await service.previewImport(1, 5, rows, 'CLUB');

      expect(teamFindFirst).toHaveBeenCalledTimes(1);
      expect(findMatchesForRow).toHaveBeenCalledTimes(2);
      expect(findMatchesForRow).toHaveBeenNthCalledWith(1, 1, 5, {
        firstName: 'Alice',
        lastName: 'Dupont',
        birthDate: new Date('2012-04-01'),
        licenseNumber: null,
      });
      expect(findMatchesForRow).toHaveBeenNthCalledWith(2, 1, 5, {
        firstName: 'Bob',
        lastName: 'Martin',
        birthDate: null,
        licenseNumber: 'CH-1234',
      });
      expect(result).toEqual([
        { index: 0, status: 'NEW', candidates: [] },
        { index: 1, status: 'REACTIVATION', candidates: [{ playerId: 7 }] },
      ]);
    });
  });

  describe('commitImport', () => {
    function buildCommitPrismaStub(overrides: Record<string, unknown> = {}) {
      const tx = {
        member: {
          create: jest.fn().mockResolvedValue({ id: 900 }),
          update: jest.fn().mockResolvedValue({ id: 42 }),
        },
        playerProfile: {
          create: jest.fn().mockResolvedValue({ id: 950 }),
          update: jest.fn().mockResolvedValue({ id: 100 }),
          // Deux usages distincts partagent ce même mock : l'existence du
          // joueur ciblé par REACTIVATE (`where.id` un nombre simple, doit
          // résoudre le profil) vs. la vérification d'unicité de licence
          // (`where.licenseNumber` présent, `where.id` absent ou `{not: X}`
          // — jamais un nombre simple) — null (pas de conflit) par défaut
          // pour ce second cas.
          findFirst: jest.fn((args: { where: Record<string, unknown> }) => {
            if (typeof args.where.id === 'number') {
              return Promise.resolve({ id: args.where.id, memberId: 42 });
            }
            return Promise.resolve(null);
          }),
        },
        playerTeam: {
          create: jest.fn().mockResolvedValue({ id: 990 }),
          update: jest.fn().mockResolvedValue({ id: 200 }),
          // Trois usages bien distincts partagent ce même mock (voir
          // roster.service.spec.ts pour le même procédé) : la recherche de
          // l'affectation ciblée par UPDATE (`where.id` un nombre simple),
          // la vérification de disponibilité du maillot (`where.jerseyNumber`
          // présent), et la vérification "déjà actif" de REACTIVATE (ni l'un
          // ni l'autre) — null (aucun conflit/aucune affectation active) par
          // défaut pour ces deux derniers cas.
          findFirst: jest.fn((args: { where: Record<string, unknown> }) => {
            if (typeof args.where.id === 'number') {
              return Promise.resolve({
                id: args.where.id,
                playerId: 100,
                jerseyNumber: 9,
                player: { memberId: 42 },
              });
            }
            return Promise.resolve(null);
          }),
        },
      };
      const transaction = jest.fn((callback: (tx: unknown) => unknown) =>
        callback(tx),
      );
      const prismaStub = {
        team: { findFirst: jest.fn().mockResolvedValue(team) },
        $transaction: transaction,
        ...overrides,
      } as unknown as PrismaService;
      return { prismaStub, tx, transaction };
    }

    function buildService(prismaStub: PrismaService) {
      return new RosterImportService(
        prismaStub,
        {} as unknown as RosterMatchingService,
      );
    }

    const createRow = {
      firstName: 'Nouveau',
      lastName: 'Joueur',
      licenseNumber: 'CH-1234',
      nationality: 'Suisse',
      jerseyNumber: 10,
    };

    it.each(['OWN', 'PARENT'] as const)(
      'refuse un appelant en scope %s, avant toute transaction',
      async (scope) => {
        const { prismaStub, transaction } = buildCommitPrismaStub();
        const service = buildService(prismaStub);

        await expect(
          service.commitImport(
            1,
            5,
            [{ action: 'CREATE', row: createRow }],
            scope,
          ),
        ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
        expect(transaction).not.toHaveBeenCalled();
      },
    );

    it("refuse si l'équipe n'appartient pas au club, avant toute transaction", async () => {
      const { prismaStub, transaction } = buildCommitPrismaStub({
        team: { findFirst: jest.fn().mockResolvedValue(null) },
      });
      const service = buildService(prismaStub);

      await expect(
        service.commitImport(
          1,
          5,
          [{ action: 'CREATE', row: createRow }],
          'CLUB',
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(transaction).not.toHaveBeenCalled();
    });

    it('CREATE : crée Member + PlayerProfile (avec licence/nationalité) + PlayerTeam', async () => {
      const { prismaStub, tx } = buildCommitPrismaStub();
      const service = buildService(prismaStub);

      const result = await service.commitImport(
        1,
        5,
        [{ action: 'CREATE', row: createRow }],
        'CLUB',
      );

      expect(tx.member.create).toHaveBeenCalledWith({
        data: {
          clubId: 1,
          firstName: 'Nouveau',
          lastName: 'Joueur',
          phone: undefined,
          gender: undefined,
          birthDate: undefined,
        },
      });
      expect(tx.playerProfile.create).toHaveBeenCalledWith({
        data: {
          memberId: 900,
          licenseNumber: 'CH-1234',
          nationality: 'Suisse',
          preferredFoot: undefined,
        },
      });
      expect(tx.playerTeam.create).toHaveBeenCalledWith({
        data: {
          playerId: 950,
          teamId: 5,
          jerseyNumber: 10,
          mainPosition: undefined,
          secondaryPositions: [],
          joinDate: undefined,
        },
      });
      expect(result).toEqual({ created: 1, updated: 0, reactivated: 0 });
    });

    it('UPDATE : nécessite playerId et playerTeamId, sinon 400', async () => {
      const { prismaStub } = buildCommitPrismaStub();
      const service = buildService(prismaStub);

      await expect(
        service.commitImport(
          1,
          5,
          [{ action: 'UPDATE', row: createRow }],
          'CLUB',
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('UPDATE : met à jour Member + PlayerProfile + PlayerTeam ciblés', async () => {
      const { prismaStub, tx } = buildCommitPrismaStub();
      const service = buildService(prismaStub);

      const result = await service.commitImport(
        1,
        5,
        [
          {
            action: 'UPDATE',
            playerId: 100,
            playerTeamId: 200,
            row: createRow,
          },
        ],
        'CLUB',
      );

      expect(tx.member.update).toHaveBeenCalledWith({
        where: { id: 42 },
        data: {
          firstName: 'Nouveau',
          lastName: 'Joueur',
          phone: undefined,
          gender: undefined,
          birthDate: undefined,
        },
      });
      expect(tx.playerProfile.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: {
          licenseNumber: 'CH-1234',
          nationality: 'Suisse',
          preferredFoot: undefined,
        },
      });
      expect(tx.playerTeam.update).toHaveBeenCalledWith({
        where: { id: 200 },
        data: {
          jerseyNumber: 10,
          mainPosition: undefined,
          secondaryPositions: [],
          joinDate: undefined,
        },
      });
      expect(result).toEqual({ created: 0, updated: 1, reactivated: 0 });
    });

    it("UPDATE : 404 si l'affectation ciblée est introuvable", async () => {
      const { prismaStub, tx } = buildCommitPrismaStub();
      (tx.playerTeam.findFirst as jest.Mock).mockResolvedValue(null);
      const service = buildService(prismaStub);

      await expect(
        service.commitImport(
          1,
          5,
          [
            {
              action: 'UPDATE',
              playerId: 100,
              playerTeamId: 200,
              row: createRow,
            },
          ],
          'CLUB',
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('REACTIVATE : nécessite playerId, sinon 400', async () => {
      const { prismaStub } = buildCommitPrismaStub();
      const service = buildService(prismaStub);

      await expect(
        service.commitImport(
          1,
          5,
          [{ action: 'REACTIVATE', row: createRow }],
          'CLUB',
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('REACTIVATE : crée uniquement une nouvelle affectation PlayerTeam, ignore les champs d’identité de la ligne', async () => {
      const { prismaStub, tx } = buildCommitPrismaStub();
      const service = buildService(prismaStub);

      const result = await service.commitImport(
        1,
        5,
        [{ action: 'REACTIVATE', playerId: 100, row: createRow }],
        'CLUB',
      );

      expect(tx.member.create).not.toHaveBeenCalled();
      expect(tx.member.update).not.toHaveBeenCalled();
      expect(tx.playerProfile.update).not.toHaveBeenCalled();
      expect(tx.playerTeam.create).toHaveBeenCalledWith({
        data: {
          playerId: 100,
          teamId: 5,
          jerseyNumber: 10,
          mainPosition: undefined,
          secondaryPositions: [],
          joinDate: undefined,
        },
      });
      expect(result).toEqual({ created: 0, updated: 0, reactivated: 1 });
    });

    it("REACTIVATE : 404 si le joueur n'appartient pas au club", async () => {
      const { prismaStub, tx } = buildCommitPrismaStub();
      (tx.playerProfile.findFirst as jest.Mock).mockResolvedValue(null);
      const service = buildService(prismaStub);

      await expect(
        service.commitImport(
          1,
          5,
          [{ action: 'REACTIVATE', playerId: 100, row: createRow }],
          'CLUB',
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('REACTIVATE : refuse (409) si une affectation active existe déjà dans cette équipe', async () => {
      const { prismaStub, tx } = buildCommitPrismaStub();
      (tx.playerTeam.findFirst as jest.Mock).mockResolvedValue({ id: 300 });
      const service = buildService(prismaStub);

      await expect(
        service.commitImport(
          1,
          5,
          [{ action: 'REACTIVATE', playerId: 100, row: createRow }],
          'CLUB',
        ),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
      expect(tx.playerTeam.create).not.toHaveBeenCalled();
    });

    it('un lot mixte renvoie le décompte correct par type de décision', async () => {
      const { prismaStub } = buildCommitPrismaStub();
      const service = buildService(prismaStub);

      const result = await service.commitImport(
        1,
        5,
        [
          { action: 'CREATE', row: createRow },
          {
            action: 'UPDATE',
            playerId: 100,
            playerTeamId: 200,
            row: createRow,
          },
          { action: 'REACTIVATE', playerId: 100, row: createRow },
        ],
        'CLUB',
      );

      expect(result).toEqual({ created: 1, updated: 1, reactivated: 1 });
    });
  });
});
