import { IsString, MinLength } from 'class-validator';

export class UpdateTeamDto {
  @IsString()
  @MinLength(1)
  name: string;
}
