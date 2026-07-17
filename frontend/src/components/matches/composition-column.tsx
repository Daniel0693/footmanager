"use client";

import { Star, UserMinus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BenchList,
  PitchSvg,
  usePitchInteractions,
  type PlacedPlayer,
} from "@/components/matches/lineup-pitch";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import {
  DEFAULT_FORMATION_ID,
  LINE_TO_POSITION,
  getFormation,
  getFormationsForGameFormat,
  type FormationSlot,
  type GameFormat,
} from "@/lib/formations";
import { playerInitials } from "@/lib/player-initials";
import type { Position } from "@/lib/positions";

type LineupStatus = "TITULAIRE" | "REMPLACANT" | "NON_CONVOQUE";

interface LineupRow {
  id: number;
  playerId: number;
  lineupStatus: LineupStatus;
  position: Position | null;
  pitchSpotId: string | null;
  shirtNumber: number | null;
  isCaptain: boolean;
  player: { id: number; member: { id: number; firstName: string; lastName: string } };
}

interface AttendanceRow {
  playerId: number;
  convocationStatus: "PENDING" | "ACCEPTED" | "DECLINED";
  player: { member: { firstName: string; lastName: string } };
}

// Colonnes Composition + Banc de l'onglet Avant-match (docs/modules/matchs.md
// §Composition, B6/B7/B8) — retourne un fragment de 2 éléments (`<>...</>`),
// placées côte à côte par le CSS grid du parent (`PreMatchTab`). Toujours
// exactement 2 éléments retournés (y compris en chargement/erreur) pour que
// le nombre de colonnes du grid parent reste stable.
//
// Le banc n'est PAS un statut persisté par défaut : c'est simplement
// "convocation acceptée, pas encore placé sur le terrain" — recalculé à
// chaque rendu. Une ligne `MatchLineup` n'existe que pour un joueur
// effectivement placé (`pitchSpotId` non nul) OU explicitement marqué "non
// retenu" (`lineupStatus = NON_CONVOQUE`, B8 — ex. surnuméraire) ; retirer du
// terrain ou remettre un non-retenu disponible supprime simplement la ligne.
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
  const tDetail = useTranslations("matchDetail");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [lineups, setLineups] = useState<LineupRow[] | null>(null);
  // Pas de résolution `Match.gameFormat ?? Championship.gameFormat` côté
  // backend pour cette route (elle n'inclut pas la relation championnat) —
  // ELEVEN (le défaut schéma du championnat) est un repli raisonnable tant
  // qu'aucun format explicite n'est défini sur le match.
  const [gameFormat, setGameFormat] = useState<GameFormat>("ELEVEN");
  const [formation, setFormation] = useState<string>(DEFAULT_FORMATION_ID.ELEVEN);
  const [canManage, setCanManage] = useState(false);
  const [attendances, setAttendances] = useState<AttendanceRow[]>([]);
  const [hasError, setHasError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [matchResponse, lineupResponse] = await Promise.all([
        apiFetch(`/clubs/${clubId}/teams/${teamId}/matches/${matchId}`, {
          headers: authHeaders(accessToken),
        }),
        apiFetch(`/clubs/${clubId}/teams/${teamId}/matches/${matchId}/lineups`, {
          headers: authHeaders(accessToken),
        }),
      ]);
      if (!matchResponse.ok || !lineupResponse.ok) throw new Error();
      const matchBody = await matchResponse.json();
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

      const resolvedGameFormat: GameFormat = matchBody.gameFormat ?? "ELEVEN";
      setGameFormat(resolvedGameFormat);
      setFormation(matchBody.formation ?? DEFAULT_FORMATION_ID[resolvedGameFormat]);
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
      isCaptain?: boolean;
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

  const removeLineup = async (id: number) => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/matches/${matchId}/lineups/${id}`,
        { method: "DELETE", headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error();
      await load();
    } catch {
      toast.error(t("removeFailed"));
    }
  };

  const currentFormation = getFormation(formation, gameFormat);
  const availableFormations = getFormationsForGameFormat(gameFormat);

  const placedRows = (lineups ?? []).filter((l) => l.pitchSpotId !== null);
  const nonRetenuRows = (lineups ?? []).filter(
    (l) => l.lineupStatus === "NON_CONVOQUE" && l.pitchSpotId === null,
  );
  const placedPlayerIds = new Set(placedRows.map((l) => l.playerId));
  const nonRetenuPlayerIds = new Set(nonRetenuRows.map((l) => l.playerId));
  const placedPlayers: PlacedPlayer[] = placedRows.map((l) => ({
    playerId: l.playerId,
    firstName: l.player.member.firstName,
    lastName: l.player.member.lastName,
    spotId: l.pitchSpotId!,
    shirtNumber: l.shirtNumber,
    isCaptain: l.isCaptain,
  }));
  const benchPlayers = attendances
    .filter(
      (a) =>
        a.convocationStatus === "ACCEPTED" &&
        !placedPlayerIds.has(a.playerId) &&
        !nonRetenuPlayerIds.has(a.playerId),
    )
    .map((a) => ({
      playerId: a.playerId,
      firstName: a.player.member.firstName,
      lastName: a.player.member.lastName,
    }));

  const handlePlace = (playerId: number, spot: FormationSlot) => {
    void submitEntry(playerId, {
      lineupStatus: "TITULAIRE",
      position: LINE_TO_POSITION[spot.line],
      pitchSpotId: spot.id,
    });
  };

  const handleUnplace = async (playerId: number) => {
    const row = (lineups ?? []).find((l) => l.playerId === playerId);
    if (!row) return;
    interactions.clearSelection();
    await removeLineup(row.id);
  };

  const handleMarkNonRetenu = async (playerId: number) => {
    interactions.clearSelection();
    await submitEntry(playerId, { lineupStatus: "NON_CONVOQUE" });
  };

  const handleRestoreToBench = async (row: LineupRow) => {
    interactions.clearSelection();
    await removeLineup(row.id);
  };

  const handleToggleCaptain = async (row: LineupRow) => {
    interactions.clearSelection();
    await submitEntry(row.playerId, {
      lineupStatus: row.lineupStatus,
      isCaptain: !row.isCaptain,
    });
  };

  const handleShirtNumberChange = (row: LineupRow, shirtNumber: number | null) => {
    if (shirtNumber === row.shirtNumber) return;
    void submitEntry(row.playerId, { lineupStatus: row.lineupStatus, shirtNumber });
  };

  const handleFormationChange = async (newFormationId: string) => {
    const newSlotIds = new Set(
      getFormation(newFormationId, gameFormat).slots.map((s) => s.id),
    );
    const incompatible = placedRows.filter(
      (row) => row.pitchSpotId && !newSlotIds.has(row.pitchSpotId),
    );
    for (const row of incompatible) {
      await apiFetch(`/clubs/${clubId}/teams/${teamId}/matches/${matchId}/lineups/${row.id}`, {
        method: "DELETE",
        headers: authHeaders(accessToken),
      });
    }
    try {
      const response = await apiFetch(`/clubs/${clubId}/teams/${teamId}/matches/${matchId}`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: JSON.stringify({ formation: newFormationId }),
      });
      if (!response.ok) throw new Error(await parseErrorCode(response));
      if (incompatible.length > 0) {
        toast.success(t("formationChangedBenchedCount", { count: incompatible.length }));
      }
      await load();
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(tErrors(code));
    }
  };

  const interactions = usePitchInteractions({
    slots: currentFormation.slots,
    placedPlayers,
    canManage,
    onPlace: handlePlace,
    onUnplace: (playerId) => void handleUnplace(playerId),
  });

  const selectedPlacedRow = placedRows.find((row) => row.playerId === interactions.selectedPlayerId);
  const selectedBenchPlayer = benchPlayers.find(
    (player) => player.playerId === interactions.selectedPlayerId,
  );
  const selectedNonRetenuRow = nonRetenuRows.find(
    (row) => row.playerId === interactions.selectedPlayerId,
  );

  return (
    <>
      <div className="flex flex-col gap-2 lg:min-h-0 lg:flex-1">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{tDetail("compositionHeading")}</h2>
          {canManage && lineups !== null && (
            <Select
              // currentFormation.id plutôt que le state `formation` brut : si
              // le format de jeu du match change (MatchEditDialog), le
              // dispositif jusqu'ici retenu peut ne plus exister dans la
              // nouvelle liste — getFormation retombe alors sur le premier
              // dispositif du nouveau format (currentFormation), qu'il faut
              // refléter dans le sélecteur plutôt que garder affiché un id
              // devenu invalide pour ce format.
              value={currentFormation.id}
              onValueChange={(value) => value && void handleFormationChange(value)}
            >
              <SelectTrigger className="w-28" size="sm" aria-label={t("formationLabel")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableFormations.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {hasError ? (
          <p className="text-sm text-destructive">{t("loadFailed")}</p>
        ) : lineups === null ? null : (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <PitchSvg
              slots={currentFormation.slots}
              canManage={canManage}
              interactions={interactions}
            />

            {selectedPlacedRow && canManage && (
              <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-amber-400 bg-amber-400/5 px-3 py-2">
                <Avatar className="size-6" aria-hidden="true">
                  <AvatarFallback className="text-[0.65rem]">
                    {playerInitials(
                      selectedPlacedRow.player.member.firstName,
                      selectedPlacedRow.player.member.lastName,
                    )}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">
                  {selectedPlacedRow.player.member.firstName}{" "}
                  {selectedPlacedRow.player.member.lastName}
                </span>
                <Input
                  key={`${selectedPlacedRow.id}-${selectedPlacedRow.shirtNumber ?? "none"}`}
                  type="number"
                  min={0}
                  max={99}
                  defaultValue={selectedPlacedRow.shirtNumber ?? ""}
                  aria-label={t("shirtNumberLabel")}
                  className="h-7 w-16"
                  onBlur={(event) => {
                    const raw = event.target.value.trim();
                    handleShirtNumberChange(selectedPlacedRow, raw === "" ? null : Number(raw));
                  }}
                />
                <Button
                  type="button"
                  size="xs"
                  variant={selectedPlacedRow.isCaptain ? "default" : "outline"}
                  onClick={() => void handleToggleCaptain(selectedPlacedRow)}
                >
                  <Star />
                  {selectedPlacedRow.isCaptain ? t("removeCaptain") : t("makeCaptain")}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("unplace")}
                  onClick={() => void handleUnplace(selectedPlacedRow.playerId)}
                >
                  <UserMinus className="text-destructive" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {!hasError && lineups !== null && canManage && (
          <>
            <div className="flex flex-col gap-2">
              <h2 className="text-base font-semibold">{t("benchHeading")}</h2>
              <BenchList benchPlayers={benchPlayers} canManage={canManage} interactions={interactions} />
              {selectedBenchPlayer && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-400 bg-amber-400/5 px-3 py-2">
                  <span className="text-sm font-medium">
                    {selectedBenchPlayer.firstName} {selectedBenchPlayer.lastName}
                  </span>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => void handleMarkNonRetenu(selectedBenchPlayer.playerId)}
                  >
                    <Users />
                    {t("markNonRetenu")}
                  </Button>
                </div>
              )}
            </div>

            {nonRetenuRows.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  {t("nonRetenuHeading")}
                </h3>
                <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {nonRetenuRows.map((row) => {
                    const isSelected = interactions.selectedPlayerId === row.playerId;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => interactions.handleBenchChipClick(row.playerId)}
                        className={`flex items-center gap-2 bg-card px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted ${isSelected ? "ring-1 ring-inset ring-amber-400" : ""}`}
                      >
                        <Avatar className="size-6" aria-hidden="true">
                          <AvatarFallback className="text-[0.65rem]">
                            {playerInitials(row.player.member.firstName, row.player.member.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        {row.player.member.firstName} {row.player.member.lastName}
                      </button>
                    );
                  })}
                </div>
                {selectedNonRetenuRow && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-400 bg-amber-400/5 px-3 py-2">
                    <span className="text-sm font-medium">
                      {selectedNonRetenuRow.player.member.firstName}{" "}
                      {selectedNonRetenuRow.player.member.lastName}
                    </span>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => void handleRestoreToBench(selectedNonRetenuRow)}
                    >
                      {t("restoreToBench")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
