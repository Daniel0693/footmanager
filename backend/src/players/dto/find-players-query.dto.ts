import { IsOptional, IsString } from 'class-validator';

// `search` alimente le sélecteur "joueur existant du club" (A16,
// docs/roadmap.md révision Season club-wide) : recherche club-wide sur le
// nom/prénom, pour retrouver un joueur actuellement affecté à une AUTRE
// équipe et l'ajouter à la sienne (ex. promotion U15 → U16 entre saisons).
// Filtrage toujours côté backend (convention du projet).
export class FindPlayersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}
