"use client";

import { useTranslations } from "next-intl";
import { use, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SeasonWizard } from "@/components/seasons/season-wizard";
import type { CreatedSeason } from "@/components/seasons/season-wizard-create-step";
import { apiFetch, authHeaders } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";

// Reprise du wizard pour une saison DRAFT déjà créée (bouton "Continuer la
// configuration", liste des saisons — A3). Composant nommé séparé du
// default export : voir la note dans teams/page.tsx (TeamsPageContent).
export function SeasonWizardResumePageContent({
  clubId,
  teamId,
  seasonId,
}: {
  clubId: string;
  teamId: string;
  seasonId: string;
}) {
  const t = useTranslations("seasons");
  const { accessToken } = useAuth();
  const [season, setSeason] = useState<CreatedSeason | null>(null);
  const [hasError, setHasError] = useState(false);

  const loadSeason = useCallback(async () => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/seasons/${seasonId}`,
        { headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error();
      setSeason((await response.json()) as CreatedSeason);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [clubId, teamId, seasonId, accessToken, t]);

  useEffect(() => {
    // Bootstrap volontaire : charge la saison à reprendre au montage — cas
    // d'usage légitime d'un effect (pas un état dérivable du rendu).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSeason();
  }, [loadSeason]);

  if (hasError) {
    return <p className="p-4 text-sm text-destructive">{t("loadFailed")}</p>;
  }
  if (!season) {
    return null;
  }

  return <SeasonWizard clubId={clubId} teamId={teamId} initialSeason={season} />;
}

export default function SeasonWizardResumePage({
  params,
}: {
  params: Promise<{ clubId: string; teamId: string; seasonId: string }>;
}) {
  const { clubId, teamId, seasonId } = use(params);
  return (
    <SeasonWizardResumePageContent clubId={clubId} teamId={teamId} seasonId={seasonId} />
  );
}
