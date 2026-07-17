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

interface ConvenedPlayerOption {
  playerId: number;
  firstName: string;
  lastName: string;
}

// Ajoute un ou plusieurs joueurs à la composition — candidats limités aux
// joueurs ayant accepté leur convocation (`ConvocationStatus.ACCEPTED`,
// docs/modules/matchs.md §Composition) : le backend n'impose que
// l'appartenance à l'équipe, mais proposer tout l'effectif ici n'aurait pas
// de sens en pratique. Ajoutés en `REMPLACANT` par défaut — le Coach
// reclasse ensuite en Titulaire/Non convoqué directement sur la ligne
// (CompositionTab), même logique d'édition en place que les convocations.
export function AddToLineupDialog({
  clubId,
  teamId,
  matchId,
  alreadyInLineupPlayerIds,
  onSuccess,
  trigger,
}: {
  clubId: string;
  teamId: string;
  matchId: string;
  alreadyInLineupPlayerIds: number[];
  onSuccess: () => void;
  trigger: React.ReactElement;
}) {
  const t = useTranslations("matchComposition");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [acceptedPlayers, setAcceptedPlayers] = useState<ConvenedPlayerOption[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadAcceptedPlayers = useCallback(async () => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/matches/${matchId}/attendances`,
        { headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error();
      const body = (await response.json()) as {
        data: {
          playerId: number;
          convocationStatus: string;
          player: { member: { firstName: string; lastName: string } };
        }[];
      };
      setAcceptedPlayers(
        body.data
          .filter((row) => row.convocationStatus === "ACCEPTED")
          .map((row) => ({
            playerId: row.playerId,
            firstName: row.player.member.firstName,
            lastName: row.player.member.lastName,
          })),
      );
    } catch {
      toast.error(t("attendancesLoadFailed"));
    }
  }, [clubId, teamId, matchId, accessToken, t]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIds(new Set());
      void loadAcceptedPlayers();
    }
  }, [open, loadAcceptedPlayers]);

  const availablePlayers = (acceptedPlayers ?? []).filter(
    (player) => !alreadyInLineupPlayerIds.includes(player.playerId),
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
        `/clubs/${clubId}/teams/${teamId}/matches/${matchId}/lineups/bulk`,
        {
          method: "POST",
          headers: authHeaders(accessToken),
          body: JSON.stringify({
            entries: Array.from(selectedIds).map((playerId) => ({
              playerId,
              lineupStatus: "REMPLACANT",
            })),
          }),
        },
      );
      if (!response.ok) throw new Error(await parseErrorCode(response));
      toast.success(t("added"));
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
          <Button onClick={handleSubmit} disabled={selectedIds.size === 0 || isSubmitting}>
            {t("add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
