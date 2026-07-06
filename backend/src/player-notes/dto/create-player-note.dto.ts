import { NoteVisibility } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

// Pas de champ authorId : assigné automatiquement au membre à l'origine de
// la création (voir PlayerNotesService.create), jamais choisi dans un
// sélecteur.
export class CreatePlayerNoteDto {
  @IsEnum(NoteVisibility)
  visibility: NoteVisibility;

  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsString()
  @MinLength(1)
  content: string;
}
