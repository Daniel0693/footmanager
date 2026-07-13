import { IsArray, IsInt } from 'class-validator';

// Étape 2 du wizard (docs/modules/saisons-championnats.md) : ids des
// PlayerProfile reconduits, sélectionnés parmi le roster actif actuel de
// l'équipe (voir SeasonRosterImportService.previewRoster). Les joueurs non
// listés ici sont implicitement des départs — traités à l'activation (A9),
// pas ici.
export class ImportSeasonRosterDto {
  @IsArray()
  @IsInt({ each: true })
  retainedPlayerIds: number[];
}
