"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";

interface ParticipantOption {
  id: number;
  internalTeam: { id: number; name: string } | null;
  externalTeam: { id: number; name: string } | null;
}

function participantLabel(participant: ParticipantOption): string {
  return participant.internalTeam?.name ?? participant.externalTeam?.name ?? "?";
}

interface BulkMatchRow {
  key: string;
  homeParticipantId: string;
  awayParticipantId: string;
  scheduledAt: string;
  round: string;
}

function emptyRow(): BulkMatchRow {
  return {
    key: crypto.randomUUID(),
    homeParticipantId: "",
    awayParticipantId: "",
    scheduledAt: "",
    round: "",
  };
}

// Même conversion que match-form-dialog.tsx (pas de fonction partagée dans
// le repo pour ce format, dupliquée par fichier, convention existante).
function toIso(value: string): string {
  return new Date(value).toISOString();
}

// Ajout en masse de rencontres (docs/roadmap.md B16, retour utilisateur —
// planifier un championnat complet une rencontre à la fois était trop
// lent) : formulaire tableau, plusieurs lignes remplies en une seule
// modale, une seule requête POST .../matches/bulk (tout ou rien côté
// backend — voir ChampionshipMatchesService.createBulk). Complète
// MatchFormDialog (création unitaire) sans le remplacer — les deux
// déclenchent le même rafraîchissement `onSuccess`.
export function BulkMatchFormDialog({
  clubId,
  teamId,
  championshipId,
  trigger,
  onSuccess,
}: {
  clubId: string;
  teamId: string;
  championshipId: string;
  trigger: ReactElement;
  onSuccess: () => void;
}) {
  const t = useTranslations("bulkMatchForm");
  const tMatch = useTranslations("matchForm");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [participants, setParticipants] = useState<ParticipantOption[] | null>(null);
  const [rows, setRows] = useState<BulkMatchRow[]>([emptyRow(), emptyRow(), emptyRow()]);

  const loadParticipants = useCallback(async () => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/championships/${championshipId}/participants`,
        { headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error();
      const body = (await response.json()) as { data: ParticipantOption[] };
      setParticipants(body.data);
    } catch {
      toast.error(tMatch("participantsLoadFailed"));
    }
  }, [clubId, teamId, championshipId, accessToken, tMatch]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows([emptyRow(), emptyRow(), emptyRow()]);
      void loadParticipants();
    }
  }, [open, loadParticipants]);

  const updateRow = (key: string, patch: Partial<BulkMatchRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const removeRow = (key: string) => {
    setRows((current) => current.filter((row) => row.key !== key));
  };

  const addRow = () => {
    setRows((current) => [...current, emptyRow()]);
  };

  const handleSubmit = async () => {
    const validRows = rows.filter(
      (row) => row.homeParticipantId && row.awayParticipantId && row.scheduledAt.trim() !== "",
    );
    if (validRows.length === 0) {
      toast.error(t("noRowsToCreate"));
      return;
    }
    const invalidRow = validRows.find(
      (row) => row.homeParticipantId === row.awayParticipantId,
    );
    if (invalidRow) {
      toast.error(tMatch("sameParticipant"));
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/championships/${championshipId}/matches/bulk`,
        {
          method: "POST",
          headers: authHeaders(accessToken),
          body: JSON.stringify({
            matches: validRows.map((row) => ({
              homeParticipantId: Number(row.homeParticipantId),
              awayParticipantId: Number(row.awayParticipantId),
              scheduledAt: toIso(row.scheduledAt),
              round: row.round.trim() === "" ? undefined : Number(row.round),
            })),
          }),
        },
      );
      if (!response.ok) throw new Error(await parseErrorCode(response));
      toast.success(t("created", { count: validRows.length }));
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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t("description")}</p>

        {/* Hauteur FIXE (pas max-height) + overflow-y-auto : la modale garde
            une taille constante dès la première ligne, jamais un
            agrandissement progressif qui recentre la modale et fait fuir le
            bouton "Ajouter une ligne" à chaque clic (retour utilisateur,
            B18) — seule la liste des lignes défile en interne, titre,
            description, "Ajouter une ligne" et bouton de soumission restent
            toujours au même endroit à l'écran, qu'il y ait 1 ou 20 lignes. */}
        <div className="flex h-[50vh] flex-col divide-y overflow-y-auto rounded-md border">
          {rows.map((row, index) => (
            <div
              key={row.key}
              className="grid grid-cols-2 items-end gap-1.5 p-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,10rem)_4rem_1.75rem] sm:gap-2"
            >
              <div className="flex min-w-0 flex-col gap-1">
                {index === 0 && <Label>{tMatch("home")}</Label>}
                <Select
                  value={row.homeParticipantId}
                  onValueChange={(value) => updateRow(row.key, { homeParticipantId: value ?? "" })}
                >
                  <SelectTrigger className="w-full" aria-label={tMatch("home")}>
                    <SelectValue>
                      {(v: string | null) =>
                        participants?.find((p) => String(p.id) === v)
                          ? participantLabel(participants.find((p) => String(p.id) === v)!)
                          : tMatch("selectTeam")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(participants ?? []).map((participant) => (
                      <SelectItem key={participant.id} value={String(participant.id)}>
                        {participantLabel(participant)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex min-w-0 flex-col gap-1">
                {index === 0 && <Label>{tMatch("away")}</Label>}
                <Select
                  value={row.awayParticipantId}
                  onValueChange={(value) => updateRow(row.key, { awayParticipantId: value ?? "" })}
                >
                  <SelectTrigger className="w-full" aria-label={tMatch("away")}>
                    <SelectValue>
                      {(v: string | null) =>
                        participants?.find((p) => String(p.id) === v)
                          ? participantLabel(participants.find((p) => String(p.id) === v)!)
                          : tMatch("selectTeam")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(participants ?? []).map((participant) => (
                      <SelectItem key={participant.id} value={String(participant.id)}>
                        {participantLabel(participant)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex min-w-0 flex-col gap-1">
                {index === 0 && <Label>{tMatch("scheduledAt")}</Label>}
                <Input
                  type="datetime-local"
                  aria-label={tMatch("scheduledAt")}
                  value={row.scheduledAt}
                  onChange={(event) => updateRow(row.key, { scheduledAt: event.target.value })}
                />
              </div>

              <div className="flex min-w-0 flex-col gap-1">
                {index === 0 && <Label>{tMatch("round")}</Label>}
                <Input
                  type="number"
                  min={1}
                  aria-label={tMatch("round")}
                  value={row.round}
                  onChange={(event) => updateRow(row.key, { round: event.target.value })}
                />
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("removeRow")}
                onClick={() => removeRow(row.key)}
                className="justify-self-end"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        <Button type="button" variant="outline" size="sm" onClick={addRow} className="self-start">
          {t("addRow")}
        </Button>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
