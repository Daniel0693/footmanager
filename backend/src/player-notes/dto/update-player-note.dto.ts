import { NoteVisibility } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdatePlayerNoteDto {
  @IsOptional()
  @IsEnum(NoteVisibility)
  visibility?: NoteVisibility;

  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;
}
