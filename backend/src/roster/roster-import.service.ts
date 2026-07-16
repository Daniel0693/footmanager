import { HttpStatus, Injectable } from '@nestjs/common';
import type { PermissionScope } from '@prisma/client';
import ExcelJS from 'exceljs';
import { Readable } from 'stream';
import { AppException } from '../common/exceptions/app.exception';
import { assertTeamInClub } from '../common/team-club-membership';
import { PrismaService } from '../prisma/prisma.service';
import type { ImportRowInputDto } from './dto/import-row-input.dto';
import {
  PlayerMatchCandidate,
  PlayerMatchStatus,
  RosterMatchingService,
} from './roster-matching.service';

// Bornes volontairement basses (docs/modules/effectif-joueurs.md §Import) :
// bornent la taille de la transaction de validation (C5, à venir) et évitent
// un fichier abusif — un import de club reste de l'ordre de quelques
// dizaines à quelques centaines de lignes, jamais des milliers.
export const MAX_IMPORT_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 Mo
export const MAX_IMPORT_ROWS = 500;

export interface ParsedImportFile {
  headers: string[];
  rows: string[][];
}

export interface ImportRowPreview {
  // Position de la ligne dans le tableau soumis — permet au frontend de
  // rattacher chaque résultat à sa ligne d'origine sans dépendre d'un id
  // stable (les lignes n'existent encore nulle part en base à cette étape).
  index: number;
  status: PlayerMatchStatus;
  candidates: PlayerMatchCandidate[];
}

function dateToIsoDate(value: Date): string {
  // Format AAAA-MM-JJ (date locale, pas .toISOString() qui bascule sur UTC
  // — même précaution que todayIsoDate() côté frontend, PlayerFormDialog).
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

// Ne délègue jamais à String() sur une cellule enrichie (rich text, formule,
// hyperlien, erreur...) : ExcelJS y renvoie un objet, pas un scalaire, et
// String() produirait "[object Object]" plutôt qu'un texte affichable.
function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return dateToIsoDate(value);
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  if ('richText' in value) {
    return value.richText.map((part) => part.text).join('');
  }
  if ('text' in value) {
    return value.text;
  }
  if ('result' in value && value.result !== undefined) {
    return value.result instanceof Date
      ? dateToIsoDate(value.result)
      : typeof value.result === 'object'
        ? '' // CellErrorValue (#N/A, #REF!...) — rien d'affichable.
        : String(value.result);
  }
  return '';
}

/**
 * Rapprochement joueur (import fichier) — étape 1/6, lecture seule : upload
 * + extraction brute des en-têtes/lignes, aucune interprétation métier ici
 * (le mapping colonne → champ est une décision de l'utilisateur, côté
 * frontend, voir docs/modules/effectif-joueurs.md §Import).
 */
@Injectable()
export class RosterImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rosterMatchingService: RosterMatchingService,
  ) {}

  async parseFile(file: {
    originalname: string;
    buffer: Buffer;
  }): Promise<ParsedImportFile> {
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    const workbook = new ExcelJS.Workbook();

    if (extension === 'csv') {
      await workbook.csv.read(Readable.from(file.buffer));
    } else if (extension === 'xlsx') {
      // `any` documenté (dernier recours, typescript-conventions.md §3) :
      // exceljs déclare son propre `Buffer` ambiant minimal et erroné
      // (`declare interface Buffer extends ArrayBuffer {}`,
      // node_modules/exceljs/index.d.ts) qui, fusionné par TypeScript avec
      // le vrai `Buffer` de @types/node dès que ce paquet est importé, rend
      // TOUT Buffer Node.js réel — y compris construit via Buffer.from() —
      // structurellement incompatible avec le paramètre attendu par
      // `.load()`. Aucun cast direct ne peut satisfaire les deux définitions
      // à la fois ; seule la valeur réelle (un Buffer) compte à l'exécution.
      const xlsxLoadInput: any = file.buffer;
      await workbook.xlsx.load(xlsxLoadInput);
    } else {
      throw new AppException(
        'ROSTER_IMPORT.UNSUPPORTED_FILE_TYPE',
        HttpStatus.BAD_REQUEST,
      );
    }

    const worksheet = workbook.worksheets[0];
    const allRows: string[][] = [];
    worksheet?.eachRow((row) => {
      // row.values est indexé à partir de 1 (l'index 0 est toujours vide) —
      // particularité d'ExcelJS, jamais un tableau de colonnes conventionnel.
      const values = row.values as ExcelJS.CellValue[];
      allRows.push(values.slice(1).map(cellToString));
    });

    if (allRows.length === 0) {
      throw new AppException(
        'ROSTER_IMPORT.EMPTY_FILE',
        HttpStatus.BAD_REQUEST,
      );
    }

    const [headers, ...rows] = allRows;
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new AppException(
        'ROSTER_IMPORT.TOO_MANY_ROWS',
        HttpStatus.BAD_REQUEST,
      );
    }

    return { headers, rows };
  }

  /**
   * Rapprochement joueur (import fichier) — étape 3/6 : reçoit les lignes
   * déjà mappées par l'utilisateur (colonne détectée → champ, décision
   * frontend), applique RosterMatchingService ligne par ligne. Lecture
   * seule, aucune écriture — le tableau de prévisualisation (étape 4)
   * affiche ces résultats, la validation (étape 5) reste une action
   * séparée et volontaire.
   *
   * Vérifie le scope de l'appelant et l'appartenance de l'équipe au club
   * une seule fois ici (`findMatchesForRow` ne le refait pas par ligne) —
   * jusqu'à MAX_IMPORT_ROWS requêtes de rapprochement, mais une seule
   * vérification de permission/équipe, pas une par ligne.
   */
  async previewImport(
    clubId: number,
    teamId: number,
    rows: ImportRowInputDto[],
    requesterScope: PermissionScope,
  ): Promise<ImportRowPreview[]> {
    if (requesterScope === 'OWN' || requesterScope === 'PARENT') {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    await assertTeamInClub(
      this.prisma,
      clubId,
      teamId,
      'ROSTER.TEAM_NOT_IN_CLUB',
    );

    const results: ImportRowPreview[] = [];
    for (const [index, row] of rows.entries()) {
      const match = await this.rosterMatchingService.findMatchesForRow(
        clubId,
        teamId,
        {
          firstName: row.firstName,
          lastName: row.lastName,
          birthDate: row.birthDate ?? null,
          licenseNumber: row.licenseNumber ?? null,
        },
      );
      results.push({
        index,
        status: match.status,
        candidates: match.candidates,
      });
    }
    return results;
  }
}
