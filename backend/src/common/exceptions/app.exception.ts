import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Exception standard de l'application : le body de la réponse ne contient
 * qu'un code (jamais de texte), la traduction est entièrement gérée côté front.
 * Voir docs/schema/index.md §i18n.
 *
 * `details` : uniquement des données structurées (compteurs, identifiants),
 * jamais de texte — même contrainte que `code`. Utilisé par
 * MEMBERS.REFERENCED_ELSEWHERE (module Effectif, suppression RGPD) pour
 * transmettre le détail par type de donnée référencée.
 */
export class AppException extends HttpException {
  constructor(
    code: string,
    status: HttpStatus,
    details?: Record<string, unknown>,
  ) {
    super({ code, ...(details ? { details } : {}) }, status);
  }
}
