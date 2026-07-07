import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class EvaluationScoreDto {
  @IsInt()
  criterionId: number;

  // Notation toujours sur 10 (CLAUDE.md — non négociable dans toute
  // l'application) ; paliers de 0.5 assurés par le frontend (étoiles avec
  // demi-étoile), pas de contrainte serveur dédiée au-delà de la plage 0-10.
  @IsNumber()
  @Min(0)
  @Max(10)
  score: number;
}

// Pas de champ evaluatorId : assigné automatiquement au membre à l'origine
// de la création (voir PlayerEvaluationsService.create), jamais choisi dans
// un sélecteur. Pas de champ teamId (contexte multi-équipe) : différé, voir
// le commentaire sur le modèle PlayerEvaluation dans schema.prisma.
// `comments` est global à la session, pas par critère.
export class CreatePlayerEvaluationDto {
  // @Type(() => Date) convertit la chaîne ISO en Date avant validation :
  // Prisma (@db.Date) rejette une simple chaîne "AAAA-MM-JJ" en entrée client.
  @Type(() => Date)
  @IsDate()
  date: Date;

  @IsOptional()
  @IsString()
  @MinLength(1)
  comments?: string;

  // Une évaluation note tous les critères actifs du club en une fois (pas un
  // critère à la fois) — décision confirmée avec l'utilisateur du 2026-07-06.
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EvaluationScoreDto)
  scores: EvaluationScoreDto[];
}
