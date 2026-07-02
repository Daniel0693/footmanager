import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Exception standard de l'application : le body de la réponse ne contient
 * qu'un code (jamais de texte), la traduction est entièrement gérée côté front.
 * Voir docs/schema/index.md §i18n.
 */
export class AppException extends HttpException {
  constructor(code: string, status: HttpStatus) {
    super({ code }, status);
  }
}
