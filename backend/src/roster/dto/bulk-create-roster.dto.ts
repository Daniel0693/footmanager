import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateRosterRowDto } from './create-roster-row.dto';

export class BulkCreateRosterDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateRosterRowDto)
  items: CreateRosterRowDto[];
}
