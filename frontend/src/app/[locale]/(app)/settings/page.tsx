"use client";

import { useTranslations } from "next-intl";

export default function SettingsPage() {
  const t = useTranslations();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
      <h1 className="text-xl font-semibold">{t("header.settings")}</h1>
      <p className="text-sm text-muted-foreground">{t("common.comingSoon")}</p>
    </div>
  );
}
