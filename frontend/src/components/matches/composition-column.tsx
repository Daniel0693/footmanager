"use client";

import { UserMinus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LineupPitch, type PlacedPlayer } from "@/components/matches/lineup-pitch";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import type { Position, PositionPitchSpot } from "@/lib/positions";

type LineupStatus = "TITULAIRE" | "REMPLACANT" | "NON_CONVOQUE";

interface LineupRow {
  id: number;
  playerId: number;
  lineupStatus: LineupStatus;
  position: Position | null;
  pitchSpotId: string | null;
  shirtNumber: number | null;
  player: { id: number; member: { id: number; firstName: string; lastName: string } };
}

interface AttendanceRow {
  playerId: number;
  convocationStatus: "PENDING" | "ACCEPTED" | "DECLINED";
  player: { member: { firstName: string; lastName: string } };
}

// Colonne Composition de l'onglet Avant-match (docs/modules/matchs.md
// §Composition, B6) — terrain SVG glisser-déposer (LineupPitch). Le banc
// n'est PAS un statut persisté : c'est simplement "accepté sa convocation,
// pas encore placé sur le terrain" (`ConvocationStatus.ACCEPTED` minus les
// lignes `MatchLineup` avec `pitchSpotId` non nul) — recalculé à chaque
// rendu, jamais stocké. Une ligne `MatchLineup` n'existe que pour un joueur
// effectivement placé ; retirer du terrain supprime la ligne plutôt que de
// la repasser en REMPLACANT (plus rien à y stocker une fois hors du
// terrain). `refreshKey` (bump par PreMatchTab quand les convocations
// changent) redéclenche le chargement pour garder le banc synchronisé sans
// dupliquer l'état des convocations ici.
export function CompositionColumn({
  clubId,
  teamId,
  matchId,
  refreshKey,
}: {
  clubId: string;
  teamId: string;
  matchId: string;
  refreshKey: number;
}) {
  const t = useTranslations("matchComposition");
  const tPositions = useTranslations("positions");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [lineups, setLineups] = useState<LineupRow[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [attendances, setAttendances] = useState<AttendanceRow[]>([]);
  const [hasError, setHasError] = useState(false);

  const load = useCallback(async () => {
    try {
      const lineupResponse = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/matches/${matchId}/lineups`,
        { headers: authHeaders(accessToken) },
      );
      if (!lineupResponse.ok) throw new Error();
      const lineupBody = await lineupResponse.json();

      // Le banc n'a de sens que pour qui peut composer — Player (lecture
      // seule) n'a de toute façon pas le droit `match_attendance` scope
      // TEAM, sa requête ne renverrait que SA PROPRE convocation (scope
      // OWN), inutilisable pour construire un banc complet.
      let attendanceData: AttendanceRow[] = [];
      if (lineupBody.canManage) {
        const attendanceResponse = await apiFetch(
          `/clubs/${clubId}/teams/${teamId}/matches/${matchId}/attendances`,
          { headers: authHeaders(accessToken) },
        );
        if (attendanceResponse.ok) {
          attendanceData = (await attendanceResponse.json()).data;
        }
      }

      setLineups(lineupBody.data);
      setCanManage(lineupBody.canManage);
      setAttendances(attendanceData);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [clubId, teamId, matchId, accessToken, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const submitEntry = async (
    playerId: number,
    patch: {
      lineupStatus: LineupStatus;
      position?: Position | null;
      pitchSpotId?: string | null;
      shirtNumber?: number | null;
    },
  ) => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/matches/${matchId}/lineups/bulk`,
        {
          method: "POST",
          headers: authHeaders(accessToken),
          body: JSON.stringify({ entries: [{ playerId, ...patch }] }),
        },
      );
      if (!response.ok) throw new Error(await parseErrorCode(response));
      await load();
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(tErrors(code));
    }
  };

  const handlePlace = (playerId: number, spot: PositionPitchSpot) => {
    void submitEntry(playerId, {
      lineupStatus: "TITULAIRE",
      position: spot.position,
      pitchSpotId: spot.id,
    });
  };

  const handleUnplace = async (playerId: number) => {
    const row = (lineups ?? []).find((l) => l.playerId === playerId);
    if (!row) return;
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/matches/${matchId}/lineups/${row.id}`,
        { method: "DELETE", headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error();
      await load();
    } catch {
      toast.error(t("removeFailed"));
    }
  };

  const handleShirtNumberChange = (row: LineupRow, shirtNumber: number | null) => {
    if (shirtNumber === row.shirtNumber) return;
    void submitEntry(row.playerId, {
      lineupStatus: row.lineupStatus,
      shirtNumber,
    });
  };

  if (hasError) {
    return <p className="text-sm text-destructive">{t("loadFailed")}</p>;
  }
  if (lineups === null) return null;

  const placedRows = lineups.filter((l) => l.pitchSpotId !== null);
  const placedPlayerIds = new Set(placedRows.map((l) => l.playerId));
  const placedPlayers: PlacedPlayer[] = placedRows.map((l) => ({
    playerId: l.playerId,
    firstName: l.player.member.firstName,
    lastName: l.player.member.lastName,
    spotId: l.pitchSpotId!,
    shirtNumber: l.shirtNumber,
  }));
  const benchPlayers = attendances
    .filter((a) => a.convocationStatus === "ACCEPTED" && !placedPlayerIds.has(a.playerId))
    .map((a) => ({
      playerId: a.playerId,
      firstName: a.player.member.firstName,
      lastName: a.player.member.lastName,
    }));

  return (
    <div className="flex flex-col gap-4">
      <LineupPitch
        benchPlayers={benchPlayers}
        placedPlayers={placedPlayers}
        canManage={canManage}
        onPlace={handlePlace}
        onUnplace={(playerId) => void handleUnplace(playerId)}
      />

      {placedRows.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">{t("titularsHeading")}</h3>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {placedRows.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {row.player.member.firstName} {row.player.member.lastName}
                  </span>
                  {row.position && <Badge variant="outline">{tPositions(row.position)}</Badge>}
                </div>
                {canManage ? (
                  <div className="flex items-center gap-2">
                    <Input
                      key={`${row.id}-${row.shirtNumber ?? "none"}`}
                      type="number"
                      min={0}
                      max={99}
                      defaultValue={row.shirtNumber ?? ""}
                      aria-label={t("shirtNumberLabel")}
                      className="h-7 w-16"
                      onBlur={(event) => {
                        const raw = event.target.value.trim();
                        handleShirtNumberChange(row, raw === "" ? null : Number(raw));
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("unplace")}
                      onClick={() => void handleUnplace(row.playerId)}
                    >
                      <UserMinus className="text-destructive" />
                    </Button>
                  </div>
                ) : (
                  row.shirtNumber !== null && <Badge variant="secondary">#{row.shirtNumber}</Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
