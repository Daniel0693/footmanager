import { render, type RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Suspense, type ReactElement } from "react";
import messages from "../../locales/fr.json";

/**
 * Rend un composant avec les vrais messages fr.json plutôt que des
 * traductions bouchonnées : un test qui vérifie un texte affiché reste
 * fiable si la clé i18n change de valeur, et casse (à raison) si la clé
 * disparaît. Voir les bugs d'affichage trouvés en A5 (libellés de filtre,
 * états d'erreur silencieux) — ce sont exactement les régressions que ces
 * tests visent à attraper.
 *
 * Enveloppé dans <Suspense> : les pages de l'App Router reçoivent `params`
 * comme une Promise dépaquetée via `use()` (Next.js 16), ce qui suspend le
 * rendu. En production, Next fournit la limite Suspense automatiquement ;
 * en test, il faut la reproduire nous-mêmes sous peine de rendu bloqué en
 * <div /> vide et d'avertissement React "suspended inside an act scope".
 */
export function renderWithIntl(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale="fr" messages={messages} timeZone="UTC">
        <Suspense fallback={null}>{children}</Suspense>
      </NextIntlClientProvider>
    ),
    ...options,
  });
}

export { screen, waitFor, within } from "@testing-library/react";
