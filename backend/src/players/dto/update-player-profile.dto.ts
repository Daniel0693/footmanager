import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdatePlayerProfileDto {
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
