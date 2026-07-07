import type { ComponentProps, Ref } from "react";

/**
 * Mock de @/i18n/navigation pour les tests de composants. À utiliser via :
 *   jest.mock("@/i18n/navigation", () => require("@/test-utils/navigation-mock"));
 * (require() dans la factory, pas un import statique — nécessaire pour que
 * le mock soit résolu correctement quel que soit l'ordre de hoisting).
 *
 * `ref` doit être transmise explicitement (prop directe, React 19) : Base UI
 * clone l'élément passé en `render` sur <Button> et lui attache une ref pour
 * gérer le focus/DOM — sans transfert de ref, le clonage échoue
 * silencieusement et le bouton ne rend rien du tout (aucune erreur levée,
 * bug trouvé en écrivant ces tests).
 */
export const push = jest.fn();
export const replace = jest.fn();
export const usePathname = jest.fn(() => "/home");

export function Link({
  href,
  children,
  ref,
  ...props
}: ComponentProps<"a"> & { href: string; ref?: Ref<HTMLAnchorElement> }) {
  return (
    <a ref={ref} href={href} {...props}>
      {children}
    </a>
  );
}

export function useRouter() {
  return { push, replace };
}
