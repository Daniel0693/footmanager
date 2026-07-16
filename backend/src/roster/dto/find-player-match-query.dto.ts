import { IsDateString, IsOptional, IsString } from 'class-validator';

// Alimente le rapprochement joueur (docs/decisions-ouvertes-et-rgpd.md,
// décisions tranchées du 2026-07-16) : nom/prénom requis (base du repli
// intra-club), date de naissance et licence optionnelles — voir
// RosterMatchingService pour la cascade exacte.
export class FindPlayerMatchQueryDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  licenseNumber?: string;
}
