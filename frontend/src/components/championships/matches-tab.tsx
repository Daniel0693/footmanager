"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch, authHeaders } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { championshipMatchStatusBadgeVariant } from "@/lib/championship-match-status";
import { MatchFormDialog, type ExistingMatch } from "@/components/championships/match-form-dialog";
import { MatchRowActions } from "@/components/championships/match-row-actions";

interface MatchRow extends ExistingMatch {
  homeParticipant: { internalTeam: { name: string } | null; externalTeam: { name: string } | null };
  awayParticipant: { internalTeam: { name: string } | null; externalTeam: { name: string } | null };
}

function teamName(participant: MatchRow["homeParticipant"]): string {
  return participant.internalTeam?.name ?? participant.externalTeam?.name ?? "?";
}

// Onglet Calendrier de la fiche championnat (docs/schema/championnats.md —
// ChampionshipMatch, B13). `canManage` masque Planifier/Modifier/Supprimer
// pour Player (lecture seule) — même convention que ParticipantsTab (B9).
export function MatchesTab({
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

  return (
    <div className="flex w-full flex-col gap-4">
      {canManage && (
        <div className="flex items-center justify-end">
          <MatchFormDialog
            clubId={clubId}
            teamId={teamId}
            championshipId={championshipId}
            onSuccess={loadMatches}
            trigger={<Button>{t("addButton")}</Button>}
          />
        </div>
      )}

      {hasError ? (
        <p className="text-sm text-destructive">{t("loadFailed")}</p>
      ) : matches !== null && matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columnRound")}</TableHead>
              <TableHead>{t("columnMatch")}</TableHead>
              <TableHead>{t("columnDate")}</TableHead>
              <TableHead>{t("columnScore")}</TableHead>
              <TableHead>{t("columnStatus")}</TableHead>
              {canManage && <TableHead className="w-0">{t("actions")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(matches ?? []).map((match) => (
              <TableRow key={match.id}>
                <TableCell>{match.round ?? "—"}</TableCell>
                <TableCell className="font-medium">
                  {teamName(match.homeParticipant)} – {teamName(match.awayParticipant)}
                </TableCell>
                <TableCell>{formatDateTime(match.scheduledAt)}</TableCell>
                <TableCell>
                  {match.scoreHome !== null && match.scoreAway !== null
                    ? `${match.scoreHome} – ${match.scoreAway}`
                    : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={championshipMatchStatusBadgeVariant(match.status)}>
                    {tStatus(match.status)}
                  </Badge>
                </TableCell>
                {canManage && (
                  <TableCell>
                    <MatchRowActions
                      clubId={clubId}
                      teamId={teamId}
                      championshipId={championshipId}
                      match={match}
                      canManage={canManage}
                      onSuccess={loadMatches}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
