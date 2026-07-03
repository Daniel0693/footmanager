import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class CreatePlayerProfileDto {
  @IsInt()
  memberId: number;

  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;
}
