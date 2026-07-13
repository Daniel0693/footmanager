"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";

interface ActivationPlayerSummary {
  playerId: number;
  firstName: string;
  lastName: string;
}

interface ActivationSummary {
  retained: ActivationPlayerSummary[];
  departing: ActivationPlayerSummary[];
  arriving: ActivationPlayerSummary[];
  oldSeasonEndDate: string | null;
}

function PlayerSummaryColumn({
  title,
  emptyLabel,
  players,
}: {
  title: string;
  emptyLabel: string;
  players: ActivationPlayerSummary[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        {title} ({players.length})
      </h3>
      {players.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {players.map((player) => (
            <li key={player.playerId}>
              {player.firstName} {player.lastName}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Étape 4 du wizard (docs/modules/saisons-championnats.md) : résumé
// reconduits/partants/arrivants, endDate de l'ancienne saison modifiable
// (pré-remplie), activation -> redirection vers la fiche de saison (A11).
export function SeasonWizardActivationStep({
  clubId,
  teamId,
  seasonId,
  onActivated,
}: {
  clubId: string;
  teamId: string;
  seasonId: number;
  onActivated: () => void;
}) {
  const t = useTranslations("seasons.wizard.activationStep");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [summary, setSummary] = useState<ActivationSummary | null>(null);
  const [hasError, setHasError] = useState(false);
  const [oldSeasonEndDate, setOldSeasonEndDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/seasons/${seasonId}/activation-summary`,
        { headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error();
      const data = (await response.json()) as ActivationSummary;
      setSummary(data);
      setOldSeasonEndDate(data.oldSeasonEndDate?.slice(0, 10) ?? "");
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [clubId, teamId, seasonId, accessToken, t]);

  useEffect(() => {
    // Bootstrap volontaire : charge le résumé d'activation à l'ouverture de
    // l'étape — cas d'usage légitime d'un effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSummary();
  }, [loadSummary]);

  const hasOldSeason = summary?.oldSeasonEndDate !== null;

  const onActivate = async () => {
    setIsSubmitting(true);
    try {
      const body = hasOldSeason && oldSeasonEndDate ? { oldSeasonEndDate } : {};
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/seasons/${seasonId}/activate`,
        {
          method: "POST",
          headers: authHeaders(accessToken),
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) throw new Error(await parseErrorCode(response));
      toast.success(t("activated"));
      onActivated();
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(code ? tErrors(code) : t("activateFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (hasError) {
    return <p className="text-sm text-destructive">{t("loadFailed")}</p>;
  }
  if (summary === null) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      {!hasOldSeason && (
        <p className="text-sm text-muted-foreground">{t("firstSeasonNotice")}</p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <PlayerSummaryColumn
          title={t("retained")}
          emptyLabel={t("none")}
          players={summary.retained}
        />
        <PlayerSummaryColumn
          title={t("departing")}
          emptyLabel={t("none")}
          players={summary.departing}
        />
        <PlayerSummaryColumn
          title={t("arriving")}
          emptyLabel={t("none")}
          players={summary.arriving}
        />
      </div>
      {hasOldSeason && (
        <div className="flex max-w-xs flex-col gap-2">
          <Label htmlFor="oldSeasonEndDate">{t("oldSeasonEndDate")}</Label>
          <Input
            id="oldSeasonEndDate"
            type="date"
            value={oldSeasonEndDate}
            onChange={(event) => setOldSeasonEndDate(event.target.value)}
          />
        </div>
      )}
      <Button onClick={onActivate} disabled={isSubmitting} className="self-start">
        {t("activate")}
      </Button>
    </div>
  );
}
