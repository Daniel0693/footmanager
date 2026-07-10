import { IsBoolean, IsOptional } from 'class-validator';

export class RemoveMemberDto {
  // Confirmation explicite supplémentaire (docs/decisions-ouvertes-et-rgpd.md)
  // : sans elle, la suppression est bloquée dès que ce membre est référencé
  // comme auteur/évaluateur/référent sur les données d'AUTRES joueurs
  // (409 MEMBERS.REFERENCED_ELSEWHERE) — archiver est alors le chemin
  // recommandé. Avec elle, ces références sont anonymisées (mises à null)
  // plutôt que de bloquer la suppression.
  @IsOptional()
  @IsBoolean()
  forceAnonymize?: boolean;
}
