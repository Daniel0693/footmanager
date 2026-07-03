import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // next-intl/use-intl (et leur chaîne de dépendances @formatjs/icu-*)
  // publient de l'ESM pur : nécessaire pour que next/jest les transforme
  // dans les tests (sinon "Unexpected token 'export'").
  transpilePackages: [
    "next-intl",
    "use-intl",
    "intl-messageformat",
    "icu-minify",
    "@schummar/icu-type-parser",
    "@formatjs/fast-memoize",
    "@formatjs/icu-messageformat-parser",
    "@formatjs/icu-skeleton-parser",
    "@formatjs/intl-localematcher",
  ],
};

export default withNextIntl(nextConfig);
