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
});
