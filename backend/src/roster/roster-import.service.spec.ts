import { HttpStatus } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { MAX_IMPORT_ROWS, RosterImportService } from './roster-import.service';

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

describe('RosterImportService', () => {
  let service: RosterImportService;

  beforeEach(() => {
    service = new RosterImportService();
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
});
