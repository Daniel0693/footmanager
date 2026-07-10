import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { UpdateRosterRowDto } from './update-roster-row.dto';

export class BulkUpdateRosterDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateRosterRowDto)
  items: UpdateRosterRowDto[];
}
