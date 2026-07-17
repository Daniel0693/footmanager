"use client";

import { Check, Clock, UserMinus, UserPlus, X } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { ConvenePlayersDialog } from "@/components/matches/convene-players-dialog";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { convocationStatusColorClassName } from "@/lib/convocation-status";
import { useAuth } from "@/lib/auth/auth-context";
import { playerInitials } from "@/lib/player-initials";

type ConvocationStatus = "PENDING" | "ACCEPTED" | "DECLINED";
const CONVOCATION_STATUSES: ConvocationStatus[] = ["PENDING", "ACCEPTED", "DECLINED"];
const CONVOCATION_STATUS_ICONS: Record<ConvocationStatus, typeof Check> = {
  PENDING: Clock,
  ACCEPTED: Check,
  DECLINED: X,
};

interface AttendanceRow {
  id: number;
  playerId: number;
  convocationStatus: ConvocationStatus;
  player: { id: number; member: { id: number; firstName: string; lastName: string } };
}

// Onglet Convocations de la fiche match (docs/modules/matchs.md §Convocations,
// B3). `canManage` renvoyé par le backend (MatchAttendancesService
// .findAllByMatch, calculé contre `match_attendance` CREATE — distinct de
// `match.canManage`, voir la note dans docs/modules/matchs.md §Droits par
// rôle) pilote entièrement l'affichage : Coach/SuperAdmin gèrent la liste
// complète, un Player/Parent ne reçoit du backend QUE sa propre convocation
// (ou celle de son enfant) — jamais besoin de filtrer "est-ce la mienne ?"
// côté frontend, le scope OWN/PARENT est déjà appliqué côté service.
export function ConvocationsTab({
  clubId,
  teamId,
  matchId,
}: {
  clubId: string;
  teamId: string;
  matchId: string;
}) {
  const t = useTranslations("matchConvocations");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [attendances, setAttendances] = useState<AttendanceRow[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [hasError, setHasError] = useState(false);

  const fetchAttendances = useCallback(async () => {
    const response = await apiFetch(
      `/clubs/${clubId}/teams/${teamId}/matches/${matchId}/attendances`,
      { headers: authHeaders(accessToken) },
    );
    if (!response.ok) throw new Error();
    return response.json();
  }, [clubId, teamId, matchId, accessToken]);

  const load = useCallback(async () => {
    try {
      const body = await fetchAttendances();
      setAttendances(body.data);
      setCanManage(body.canManage);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [fetchAttendances, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const body = await fetchAttendances();
        if (!cancelled) {
          setAttendances(body.data);
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
  }, [fetchAttendances, t]);

  const handleRespond = async (id: number, convocationStatus: ConvocationStatus) => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/matches/${matchId}/attendances/${id}`,
        {
          method: "PATCH",
          headers: authHeaders(accessToken),
          body: JSON.stringify({ convocationStatus }),
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
        `/clubs/${clubId}/teams/${teamId}/matches/${matchId}/attendances/${id}`,
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
          <ConvenePlayersDialog
            clubId={clubId}
            teamId={teamId}
            matchId={matchId}
            alreadyConvenedPlayerIds={(attendances ?? []).map((a) => a.playerId)}
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
      ) : attendances === null ? null : attendances.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {attendances.map((attendance) => (
            <div
              key={attendance.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
            >
              <div className="flex items-center gap-3">
                <Avatar className="size-8">
                  <AvatarFallback>
                    {playerInitials(
                      attendance.player.member.firstName,
                      attendance.player.member.lastName,
                    )}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">
                  {attendance.player.member.firstName} {attendance.player.member.lastName}
                </span>
              </div>

              {canManage ? (
                <div className="flex items-center gap-2">
                  <div
                    role="group"
                    aria-label={t("convocationStatusLabel")}
                    className="flex items-center gap-1"
                  >
                    {CONVOCATION_STATUSES.map((status) => {
                      const Icon = CONVOCATION_STATUS_ICONS[status];
                      const isActive = attendance.convocationStatus === status;
                      return (
                        <Button
                          key={status}
                          type="button"
                          size="icon-xs"
                          variant="outline"
                          className={isActive ? convocationStatusColorClassName(status) : undefined}
                          aria-pressed={isActive}
                          aria-label={t(`convocation${status}`)}
                          title={t(`convocation${status}`)}
                          onClick={() => void handleRespond(attendance.id, status)}
                        >
                          <Icon />
                        </Button>
                      );
                    })}
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
                        <AlertDialogClose render={<Button variant="outline">{t("cancel")}</Button>} />
                        <AlertDialogClose
                          render={
                            <Button
                              variant="destructive"
                              onClick={() => void handleRemove(attendance.id)}
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
                  <Button
                    size="xs"
                    variant={attendance.convocationStatus === "ACCEPTED" ? "default" : "outline"}
                    onClick={() => void handleRespond(attendance.id, "ACCEPTED")}
                  >
                    {t("accept")}
                  </Button>
                  <Button
                    size="xs"
                    variant={attendance.convocationStatus === "DECLINED" ? "destructive" : "outline"}
                    onClick={() => void handleRespond(attendance.id, "DECLINED")}
                  >
                    {t("decline")}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
