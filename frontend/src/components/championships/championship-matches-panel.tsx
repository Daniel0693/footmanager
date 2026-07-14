"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch, authHeaders } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils";
import { championshipMatchStatusBadgeVariant } from "@/lib/championship-match-status";
import { MatchFormDialog, type ExistingMatch } from "@/components/championships/match-form-dialog";
import { MatchRowActions } from "@/components/championships/match-row-actions";
import { BulkMatchFormDialog } from "@/components/championships/bulk-match-form-dialog";

interface MatchParticipant {
  internalTeam: { id: number; name: string } | null;
  externalTeam: { name: string } | null;
}

interface MatchRow extends ExistingMatch {
  homeParticipant: MatchParticipant;
  awayParticipant: MatchParticipant;
}

function teamName(participant: MatchParticipant): string {
  return participant.internalTeam?.name ?? participant.externalTeam?.name ?? "?";
}

function isOwnTeam(participant: MatchParticipant, teamId: string): boolean {
  return participant.internalTeam?.id === Number(teamId);
}

// Calendrier compact de la fiche championnat (docs/roadmap.md B16,
// remplace l'ancien onglet Calendrier en table pleine largeur, B13) : liste
// triée par date (pas par journée), pensée pour la colonne 1/4 à côté du
// classement (3/4). Les rencontres impliquant l'équipe propriétaire du
// championnat (`teamId` de l'URL) sont mises en valeur pour un repérage
// immédiat. `canManage` masque Planifier/Modifier/Supprimer pour Player
// (lecture seule) — même convention que les autres sous-ressources
// championnat.
export function ChampionshipMatchesPanel({
  clubId,
  teamId,
  championshipId,
}: {
  clubId: string;
  teamId: string;
  championshipId: string;
}) {
  const t = useTranslations("championshipMatches");
  const tStatus = useTranslations("championshipMatches.status");
  const locale = useLocale();
  const { accessToken } = useAuth();
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [hasError, setHasError] = useState(false);

  const loadMatches = useCallback(async () => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/championships/${championshipId}/matches`,
        { headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { data: MatchRow[]; canManage: boolean };
      setMatches(data.data);
      setCanManage(data.canManage);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [clubId, teamId, championshipId, accessToken, t]);

  useEffect(() => {
    // Bootstrap volontaire : charge les rencontres au montage — cas d'usage
    // légitime d'un effect (pas un état dérivable du rendu).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMatches();
  }, [loadMatches]);

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  const sortedMatches = [...(matches ?? [])].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <MatchFormDialog
              clubId={clubId}
              teamId={teamId}
              championshipId={championshipId}
              onSuccess={loadMatches}
              trigger={
                <Button size="sm" variant="outline">
                  {t("addButton")}
                </Button>
              }
            />
            <BulkMatchFormDialog
              clubId={clubId}
              teamId={teamId}
              championshipId={championshipId}
              onSuccess={loadMatches}
              trigger={
                <Button size="sm" variant="outline">
                  {t("bulkAddButton")}
                </Button>
              }
            />
          </div>
        )}
      </div>

      {hasError ? (
        <p className="text-sm text-destructive">{t("loadFailed")}</p>
      ) : matches !== null && matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sortedMatches.map((match) => {
            const own =
              isOwnTeam(match.homeParticipant, teamId) || isOwnTeam(match.awayParticipant, teamId);
            return (
              <li
                key={match.id}
                className={cn(
                  "rounded-md border p-2 text-sm",
                  own ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {match.round !== null ? t("roundLabel", { round: match.round }) : "—"} ·{" "}
                    {formatDateTime(match.scheduledAt)}
                  </span>
                  <div className="flex items-center gap-1">
                    <Badge variant={championshipMatchStatusBadgeVariant(match.status)}>
                      {tStatus(match.status)}
                    </Badge>
                    {canManage && (
                      <MatchRowActions
                        clubId={clubId}
                        teamId={teamId}
                        championshipId={championshipId}
                        match={match}
                        canManage={canManage}
                        onSuccess={loadMatches}
                      />
                    )}
                  </div>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className={isOwnTeam(match.homeParticipant, teamId) ? "font-semibold" : ""}>
                    {teamName(match.homeParticipant)}
                  </span>
                  <span className="font-medium">{match.scoreHome ?? "–"}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className={isOwnTeam(match.awayParticipant, teamId) ? "font-semibold" : ""}>
                    {teamName(match.awayParticipant)}
                  </span>
                  <span className="font-medium">{match.scoreAway ?? "–"}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
