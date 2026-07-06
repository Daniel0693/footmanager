import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, MinLength } from 'class-validator';

// Pas de champ staffId : assigné automatiquement au membre à l'origine de la
// création (voir PlayerInterviewsService.create). Seuls date/subject/summary
// sont requis, pour permettre de planifier un entretien à l'avance ;
// staffFeedback/staffAssessment/playerFeedback se complètent après coup via
// UPDATE (décision du 2026-07-06, étape A7.2).
export class CreatePlayerInterviewDto {
  // @Type(() => Date) convertit la chaîne ISO en Date avant validation :
  // Prisma (@db.Date) rejette une simple chaîne "AAAA-MM-JJ" en entrée client.
  @Type(() => Date)
  @IsDate()
  date: Date;

  @IsString()
  @MinLength(1)
  subject: string;

  @IsString()
  @MinLength(1)
  summary: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  staffFeedback?: string;

  // Ressenti/évaluation interne de l'encadrant — jamais visible par le joueur
  // (voir le commentaire sur le modèle PlayerInterview dans schema.prisma).
  @IsOptional()
  @IsString()
  @MinLength(1)
  staffAssessment?: string;

  // Résumé par le staff de ce que le joueur a exprimé pendant l'entretien —
  // visible par le joueur, à la différence de staffAssessment.
  @IsOptional()
  @IsString()
  @MinLength(1)
  playerFeedback?: string;
}
