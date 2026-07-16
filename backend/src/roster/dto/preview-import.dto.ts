import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { ImportRowInputDto } from './import-row-input.dto';
import { MAX_IMPORT_ROWS } from '../roster-import.service';

export class PreviewImportDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IMPORT_ROWS)
  @ValidateNested({ each: true })
  @Type(() => ImportRowInputDto)
  rows: ImportRowInputDto[];
}
