"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";

interface RosterPlayerOption {
  playerId: number;
  firstName: string;
  lastName: string;
}

// Convoque un ou plusieurs joueurs de l'effectif pour ce match — création en
// masse idempotente côté backend (docs/modules/matchs.md §Convocations,
// MatchAttendancesService.createBulk, B1), donc pas besoin de filtrer les
// joueurs déjà convoqués côté client avant l'envoi ; on les masque tout de
// même de la liste pour éviter de les recocher par erreur.
export function ConvenePlayersDialog({
  clubId,
  teamId,
  matchId,
  alreadyConvenedPlayerIds,
  onSuccess,
  trigger,
}: {
  clubId: string;
  teamId: string;
  matchId: string;
  alreadyConvenedPlayerIds: number[];
  onSuccess: () => void;
  trigger: React.ReactElement;
}) {
  const t = useTranslations("matchConvocations");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [roster, setRoster] = useState<RosterPlayerOption[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadRoster = useCallback(async () => {
    try {
      const response = await apiFetch(`/clubs/${clubId}/teams/${teamId}/roster`, {
        headers: authHeaders(accessToken),
      });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as {
        data: {
          role: string;
          playerId: number | null;
          firstName: string;
          lastName: string;
        }[];
      };
      setRoster(
        body.data
          .filter(
            (row): row is typeof row & { playerId: number } =>
              row.role === "PLAYER" && row.playerId !== null,
          )
          .map((row) => ({
            playerId: row.playerId,
            firstName: row.firstName,
            lastName: row.lastName,
          })),
      );
    } catch {
      toast.error(t("rosterLoadFailed"));
    }
  }, [clubId, teamId, accessToken, t]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIds(new Set());
      void loadRoster();
    }
  }, [open, loadRoster]);

  const availablePlayers = (roster ?? []).filter(
    (player) => !alreadyConvenedPlayerIds.includes(player.playerId),
  );

  const toggle = (playerId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedIds.size === 0) return;
    setIsSubmitting(true);
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/matches/${matchId}/attendances/bulk`,
        {
          method: "POST",
          headers: authHeaders(accessToken),
          body: JSON.stringify({ playerIds: Array.from(selectedIds) }),
        },
      );
      if (!response.ok) throw new Error(await parseErrorCode(response));
      toast.success(t("convened"));
      setOpen(false);
      onSuccess();
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(tErrors(code));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("selectPlayersTitle")}</DialogTitle>
        </DialogHeader>
        {availablePlayers.length > 0 ? (
          <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            {availablePlayers.map((player) => (
              <label
                key={player.playerId}
                className="flex items-center gap-2 rounded-md p-1.5 text-sm hover:bg-accent"
              >
                <Checkbox
                  checked={selectedIds.has(player.playerId)}
                  onCheckedChange={() => toggle(player.playerId)}
                />
                {player.firstName} {player.lastName}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noAvailablePlayers")}</p>
        )}
        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={selectedIds.size === 0 || isSubmitting}
          >
            {t("convene")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
