"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import {
  CHAMPIONSHIP_MATCH_STATUSES,
  type ChampionshipMatchStatus,
} from "@/lib/championship-match-status";

export interface ExistingMatch {
  id: number;
  homeParticipantId: number;
  awayParticipantId: number;
  scheduledAt: string;
  round: number | null;
  status: ChampionshipMatchStatus;
  scoreHome: number | null;
  scoreAway: number | null;
}

interface ParticipantOption {
  id: number;
  internalTeam: { id: number; name: string } | null;
  externalTeam: { id: number; name: string } | null;
}

function participantLabel(participant: ParticipantOption): string {
  return participant.internalTeam?.name ?? participant.externalTeam?.name ?? "?";
}

// "AAAA-MM-JJTHH:mm" (input datetime-local) en heure locale ↔ ISO — même
// conversion que event-form-dialog.tsx (calendrier), pas de fonction
// partagée dans le repo pour ce format (dupliquée par fichier, convention
// existante).
function toDatetimeLocalValue(value: string): string {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIso(value: string): string {
  return new Date(value).toISOString();
}

const formSchema = z.object({
  homeParticipantId: z.string().min(1),
  awayParticipantId: z.string().min(1),
  scheduledAt: z.string().min(1),
  round: z.string(),
  status: z.string(),
  scoreHome: z.string(),
  scoreAway: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

function defaultValues(match?: ExistingMatch): FormValues {
  return {
    homeParticipantId: match ? String(match.homeParticipantId) : "",
    awayParticipantId: match ? String(match.awayParticipantId) : "",
    scheduledAt: match ? toDatetimeLocalValue(match.scheduledAt) : "",
    round: match?.round !== null && match?.round !== undefined ? String(match.round) : "",
    status: match?.status ?? "SCHEDULED",
    scoreHome: match?.scoreHome !== null && match?.scoreHome !== undefined ? String(match.scoreHome) : "",
    scoreAway: match?.scoreAway !== null && match?.scoreAway !== undefined ? String(match.scoreAway) : "",
  };
}

// Modale de planification/édition d'une rencontre (docs/schema/
// championnats.md — ChampionshipMatch). Les deux équipes ne sont
// sélectionnables qu'à la création (le backend n'accepte pas leur
// modification ensuite, voir UpdateChampionshipMatchDto) ; le score et le
// statut ne sont éditables qu'en modification. Passage à Terminée exige les
// deux scores — revalidé ici pour un retour immédiat, la seule vraie
// protection reste le backend (ChampionshipMatchesService.update).
export function MatchFormDialog({
  clubId,
  teamId,
  championshipId,
  match,
  trigger,
  onSuccess,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  clubId: string;
  teamId: string;
  championshipId: string;
  trigger?: ReactElement;
  match?: ExistingMatch;
  onSuccess: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const mode = match ? "edit" : "create";
  const t = useTranslations("matchForm");
  const tStatus = useTranslations("championshipMatches.status");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChangeProp ?? setInternalOpen;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [participants, setParticipants] = useState<ParticipantOption[] | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(match),
  });

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
      toast.error(t("participantsLoadFailed"));
    }
  }, [clubId, teamId, championshipId, accessToken, t]);

  useEffect(() => {
    if (open) {
      reset(defaultValues(match));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadParticipants();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, match]);

  const onSubmit = async (values: FormValues) => {
    if (values.homeParticipantId === values.awayParticipantId) {
      toast.error(t("sameParticipant"));
      return;
    }
    if (
      values.status === "FINISHED" &&
      (values.scoreHome.trim() === "" || values.scoreAway.trim() === "")
    ) {
      toast.error(t("finishedRequiresScore"));
      return;
    }

    setIsSubmitting(true);
    const headers = authHeaders(accessToken);
    const body =
      mode === "create"
        ? JSON.stringify({
            homeParticipantId: Number(values.homeParticipantId),
            awayParticipantId: Number(values.awayParticipantId),
            scheduledAt: toIso(values.scheduledAt),
            round: values.round.trim() === "" ? undefined : Number(values.round),
          })
        : JSON.stringify({
            scheduledAt: toIso(values.scheduledAt),
            round: values.round.trim() === "" ? undefined : Number(values.round),
            status: values.status,
            scoreHome: values.scoreHome.trim() === "" ? undefined : Number(values.scoreHome),
            scoreAway: values.scoreAway.trim() === "" ? undefined : Number(values.scoreAway),
          });
    try {
      const response =
        mode === "create"
          ? await apiFetch(
              `/clubs/${clubId}/teams/${teamId}/championships/${championshipId}/matches`,
              { method: "POST", headers, body },
            )
          : await apiFetch(
              `/clubs/${clubId}/teams/${teamId}/championships/${championshipId}/matches/${match!.id}`,
              { method: "PATCH", headers, body },
            );
      if (!response.ok) throw new Error(await parseErrorCode(response));

      toast.success(mode === "create" ? t("created") : t("updated"));
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
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("createTitle") : t("editTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {mode === "create" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>{t("home")}</Label>
                <Controller
                  control={control}
                  name="homeParticipantId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full" aria-label={t("home")}>
                        <SelectValue>
                          {(v: string | null) =>
                            participants?.find((p) => String(p.id) === v)
                              ? participantLabel(participants.find((p) => String(p.id) === v)!)
                              : t("selectTeam")
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
                  )}
                />
                {errors.homeParticipantId && (
                  <p className="text-sm text-destructive">{t("teamRequired")}</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label>{t("away")}</Label>
                <Controller
                  control={control}
                  name="awayParticipantId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full" aria-label={t("away")}>
                        <SelectValue>
                          {(v: string | null) =>
                            participants?.find((p) => String(p.id) === v)
                              ? participantLabel(participants.find((p) => String(p.id) === v)!)
                              : t("selectTeam")
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
                  )}
                />
                {errors.awayParticipantId && (
                  <p className="text-sm text-destructive">{t("teamRequired")}</p>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="match-scheduledAt">{t("scheduledAt")}</Label>
              <Input id="match-scheduledAt" type="datetime-local" {...register("scheduledAt")} />
              {errors.scheduledAt && (
                <p className="text-sm text-destructive">{t("scheduledAtRequired")}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="match-round">{t("round")}</Label>
              <Input id="match-round" type="number" min={1} {...register("round")} />
            </div>
          </div>

          {mode === "edit" && (
            <>
              <div className="flex flex-col gap-2">
                <Label>{t("status")}</Label>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full" aria-label={t("status")}>
                        <SelectValue>{(v: string | null) => (v ? tStatus(v) : "")}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {CHAMPIONSHIP_MATCH_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {tStatus(status)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="match-scoreHome">{t("scoreHome")}</Label>
                  <Input id="match-scoreHome" type="number" min={0} {...register("scoreHome")} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="match-scoreAway">{t("scoreAway")}</Label>
                  <Input id="match-scoreAway" type="number" min={0} {...register("scoreAway")} />
                </div>
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {mode === "create" ? t("submitCreate") : t("submitEdit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
