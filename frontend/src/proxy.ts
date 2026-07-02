import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Next.js 16 renomme la convention `middleware.ts` en `proxy.ts` (le nom de
// fichier suffit à Next pour la détecter, l'export par défaut reste inchangé).
export default createMiddleware(routing);

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
