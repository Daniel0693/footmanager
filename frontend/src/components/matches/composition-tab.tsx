"use client";

import { UserMinus, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AddToLineupDialog } from "@/components/matches/add-to-lineup-dialog";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { playerInitials } from "@/lib/player-initials";
import { POSITIONS, type Position } from "@/lib/positions";

type LineupStatus = "TITULAIRE" | "REMPLACANT" | "NON_CONVOQUE";
const LINEUP_STATUSES: LineupStatus[] = ["TITULAIRE", "REMPLACANT", "NON_CONVOQUE"];
const NONE = "NONE";

interface LineupRow {
  id: number;
  playerId: number;
  lineupStatus: LineupStatus;
  position: Position | null;
  shirtNumber: number | null;
  player: { id: number; member: { id: number; firstName: string; lastName: string } };
}

// Onglet Composition de la fiche match (docs/modules/matchs.md §Composition,
// B4). Pas de PATCH ligne par ligne côté backend : chaque changement (statut/
// poste/numéro) renvoie un `POST .../lineups/bulk` avec une seule entrée —
// `lineupStatus` toujours inclus (requis par le DTO), `position`/
// `shirtNumber` omis quand non concernés par le changement (Prisma ignore un
// champ `undefined` à l'update, contrairement à `null` qui l'efface
// explicitement — voir MatchLineupsService.upsertBulk).
export function CompositionTab({
  clubId,
  teamId,
  matchId,
}: {
  clubId: string;
  teamId: string;
  matchId: string;
}) {
  const t = useTranslations("matchComposition");
  const tPositions = useTranslations("positions");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [lineups, setLineups] = useState<LineupRow[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [hasError, setHasError] = useState(false);

  const fetchLineups = useCallback(async () => {
    const response = await apiFetch(
      `/clubs/${clubId}/teams/${teamId}/matches/${matchId}/lineups`,
      { headers: authHeaders(accessToken) },
    );
    if (!response.ok) throw new Error();
    return response.json();
  }, [clubId, teamId, matchId, accessToken]);

  const load = useCallback(async () => {
    try {
      const body = await fetchLineups();
      setLineups(body.data);
      setCanManage(body.canManage);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [fetchLineups, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const body = await fetchLineups();
        if (!cancelled) {
          setLineups(body.data);
          setCanManage(body.canManage);
          setHasError(false);
        }
      } catch {
        if (!cancelled) {
          setHasError(true);
          toast.error(t("loadFailed"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchLineups, t]);

  const submitEntry = async (
    playerId: number,
    lineupStatus: LineupStatus,
    patch: { position?: Position | null; shirtNumber?: number | null } = {},
  ) => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/matches/${matchId}/lineups/bulk`,
        {
          method: "POST",
          headers: authHeaders(accessToken),
          body: JSON.stringify({ entries: [{ playerId, lineupStatus, ...patch }] }),
        },
      );
      if (!response.ok) throw new Error(await parseErrorCode(response));
      await load();
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(tErrors(code));
    }
  };

  const handleRemove = async (id: number) => {
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

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex justify-end">
          <AddToLineupDialog
            clubId={clubId}
            teamId={teamId}
            matchId={matchId}
            alreadyInLineupPlayerIds={(lineups ?? []).map((l) => l.playerId)}
            onSuccess={load}
            trigger={
              <Button>
                <UserPlus />
                {t("addButton")}
              </Button>
            }
          />
        </div>
      )}

      {hasError ? (
        <p className="text-sm text-destructive">{t("loadFailed")}</p>
      ) : lineups === null ? null : lineups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {LINEUP_STATUSES.map((status) => {
            const rows = lineups.filter((lineup) => lineup.lineupStatus === status);
            if (rows.length === 0) return null;
            return (
              <div key={status} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  {t(`status${status}`)}
                </h3>
                <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {rows.map((lineup) => (
                    <div
                      key={lineup.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback>
                            {playerInitials(
                              lineup.player.member.firstName,
                              lineup.player.member.lastName,
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">
                          {lineup.player.member.firstName} {lineup.player.member.lastName}
                        </span>
                      </div>

                      {canManage ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            value={lineup.position ?? NONE}
                            onValueChange={(value) => {
                              const position = value === NONE ? null : (value as Position);
                              if (position === lineup.position) return;
                              void submitEntry(lineup.playerId, lineup.lineupStatus, {
                                position,
                              });
                            }}
                          >
                            <SelectTrigger className="w-28" size="sm" aria-label={t("positionLabel")}>
                              <SelectValue>
                                {(value: string | null) =>
                                  value && value !== NONE
                                    ? tPositions(value)
                                    : t("positionUnspecified")
                                }
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>{t("positionUnspecified")}</SelectItem>
                              {POSITIONS.map((position) => (
                                <SelectItem key={position} value={position}>
                                  {tPositions(position)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            key={`${lineup.id}-${lineup.shirtNumber ?? "none"}`}
                            type="number"
                            min={0}
                            max={99}
                            defaultValue={lineup.shirtNumber ?? ""}
                            aria-label={t("shirtNumberLabel")}
                            className="h-7 w-16"
                            onBlur={(event) => {
                              const raw = event.target.value.trim();
                              const shirtNumber = raw === "" ? null : Number(raw);
                              if (shirtNumber === lineup.shirtNumber) return;
                              void submitEntry(lineup.playerId, lineup.lineupStatus, {
                                shirtNumber,
                              });
                            }}
                          />
                          <div
                            role="group"
                            aria-label={t("lineupStatusLabel")}
                            className="flex items-center gap-1"
                          >
                            {LINEUP_STATUSES.map((candidateStatus) => (
                              <Button
                                key={candidateStatus}
                                type="button"
                                size="xs"
                                variant={
                                  lineup.lineupStatus === candidateStatus ? "default" : "outline"
                                }
                                aria-pressed={lineup.lineupStatus === candidateStatus}
                                onClick={() =>
                                  void submitEntry(lineup.playerId, candidateStatus)
                                }
                              >
                                {t(`status${candidateStatus}`)}
                              </Button>
                            ))}
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger
                              render={
                                <Button variant="ghost" size="icon-xs" aria-label={t("remove")}>
                                  <UserMinus className="text-destructive" />
                                </Button>
                              }
                            />
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("removeDialogTitle")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("removeDialogDescription")}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogClose
                                  render={<Button variant="outline">{t("cancel")}</Button>}
                                />
                                <AlertDialogClose
                                  render={
                                    <Button
                                      variant="destructive"
                                      onClick={() => void handleRemove(lineup.id)}
                                    >
                                      {t("removeConfirm")}
                                    </Button>
                                  }
                                />
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {lineup.position && (
                            <Badge variant="outline">{tPositions(lineup.position)}</Badge>
                          )}
                          {lineup.shirtNumber !== null && (
                            <Badge variant="secondary">#{lineup.shirtNumber}</Badge>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
