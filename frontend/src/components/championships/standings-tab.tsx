"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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

interface StandingsRow {
  participantId: number;
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsScored: number;
  goalsConceded: number;
  goalDifference: number;
  points: number;
  participant: {
    internalTeam: { name: string } | null;
    externalTeam: { name: string } | null;
  } | null;
}

function teamName(row: StandingsRow): string {
  return row.participant?.internalTeam?.name ?? row.participant?.externalTeam?.name ?? "?";
}

// Onglet Classement de la fiche championnat (docs/modules/
// saisons-championnats.md — Classement, B14). Calculé à la volée côté
// backend (compute-standings.ts, B12), jamais persisté : cette page est
// purement en lecture pour tous les rôles (Coach comme Player) — aucune
// action d'édition n'existe sur le classement lui-même, contrairement aux
// autres onglets (Participants/Calendrier). Même route pour tout le monde,
// pas de variante en lecture seule séparée.
export function StandingsTab({
  clubId,
  teamId,
  championshipId,
}: {
  clubId: string;
  teamId: string;
  championshipId: string;
}) {
  const t = useTranslations("standings");
  const { accessToken } = useAuth();
  const [rows, setRows] = useState<StandingsRow[] | null>(null);
  const [hasError, setHasError] = useState(false);

  const loadStandings = useCallback(async () => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/championships/${championshipId}/standings`,
        { headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error();
      const data = (await response.json()) as StandingsRow[];
      setRows(data);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [clubId, teamId, championshipId, accessToken, t]);

  useEffect(() => {
    // Bootstrap volontaire : charge le classement au montage — cas d'usage
    // légitime d'un effect (pas un état dérivable du rendu).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStandings();
  }, [loadStandings]);

  if (hasError) {
    return <p className="text-sm text-destructive">{t("loadFailed")}</p>;
  }

  if (rows !== null && rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columnRank")}</TableHead>
          <TableHead>{t("columnTeam")}</TableHead>
          <TableHead className="text-right">{t("columnPlayed")}</TableHead>
          <TableHead className="text-right">{t("columnWins")}</TableHead>
          <TableHead className="text-right">{t("columnDraws")}</TableHead>
          <TableHead className="text-right">{t("columnLosses")}</TableHead>
          <TableHead className="text-right">{t("columnGoalsScored")}</TableHead>
          <TableHead className="text-right">{t("columnGoalsConceded")}</TableHead>
          <TableHead className="text-right">{t("columnGoalDifference")}</TableHead>
          <TableHead className="text-right">{t("columnPoints")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(rows ?? []).map((row) => (
          <TableRow key={row.participantId}>
            <TableCell>{row.rank}</TableCell>
            <TableCell className="font-medium">{teamName(row)}</TableCell>
            <TableCell className="text-right">{row.played}</TableCell>
            <TableCell className="text-right">{row.wins}</TableCell>
            <TableCell className="text-right">{row.draws}</TableCell>
            <TableCell className="text-right">{row.losses}</TableCell>
            <TableCell className="text-right">{row.goalsScored}</TableCell>
            <TableCell className="text-right">{row.goalsConceded}</TableCell>
            <TableCell className="text-right">{row.goalDifference}</TableCell>
            <TableCell className="text-right font-semibold">{row.points}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
