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
import { Textarea } from "@/components/ui/textarea";
import { ExternalTeamFormDialog } from "@/components/championships/external-team-form-dialog";
import { CUP_ROUNDS } from "@/components/calendar/event-form-dialog";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { GAME_FORMATS, GAME_FORMAT_PLAYER_COUNT, type GameFormat } from "@/lib/formations";

export interface EditableMatch {
  id: number;
  matchType: "CHAMPIONNAT" | "COUPE" | "AMICAL" | "TOURNOI";
  homeOrAway: "HOME" | "AWAY";
  gameFormat: GameFormat | null;
  cupRound: string | null;
  opponentExternalTeamId: number | null;
  opponentExternalTeam: { id: number; name: string } | null;
  event: {
    title: string;
    startAt: string;
    endAt: string | null;
    location: string | null;
    description: string | null;
  };
}

interface MatchOpponentOption {
  id: number;
  name: string;
}

// "AAAA-MM-JJTHH:mm" (input datetime-local) en heure locale ↔ ISO — même
// conversion que event-form-dialog.tsx (calendrier) et championships/
// match-form-dialog.tsx, dupliquée par fichier (convention existante, pas de
// fonction partagée dans le repo pour ce format).
function toDatetimeLocalValue(value: string): string {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIso(value: string): string {
  return new Date(value).toISOString();
}

function toOptionalText(value: string): string | undefined {
  return value.trim() !== "" ? value : undefined;
}

const formSchema = z.object({
  title: z.string().min(1),
  startAt: z.string().min(1),
  endAt: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  gameFormat: z.enum(GAME_FORMATS),
  homeOrAway: z.string().optional(),
  cupRound: z.string().optional(),
  opponentExternalTeamId: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function defaultValues(match: EditableMatch): FormValues {
  return {
    title: match.event.title,
    startAt: toDatetimeLocalValue(match.event.startAt),
    endAt: match.event.endAt ? toDatetimeLocalValue(match.event.endAt) : "",
    location: match.event.location ?? "",
    description: match.event.description ?? "",
    gameFormat: match.gameFormat ?? "ELEVEN",
    homeOrAway: match.homeOrAway,
    cupRound: match.cupRound ?? undefined,
    opponentExternalTeamId: match.opponentExternalTeamId
      ? String(match.opponentExternalTeamId)
      : "",
  };
}

// Modale d'édition d'un match existant (docs/modules/matchs.md §Cycle de
// vie, B11, retour utilisateur 2026-07-17 — "je ne peux pas éditer mes
// matchs") : PATCH /matches/:id couvre déjà Event (titre/horaires/lieu/
// description) ET Match (gameFormat/etc.) en une seule transaction côté
// backend (MatchesService.update), rien à ajouter là. `matchType` est
// immuable (voir UpdateMatchDto — retype = suppression + recréation) : champ
// affiché en lecture seule, jamais dans le formulaire. Pour un match
// CHAMPIONNAT, adversaire/phase de coupe/domicile-extérieur sont dérivés du
// ChampionshipMatch source de vérité et rejetés par le backend
// (MATCHES.OPPONENT_NOT_EDITABLE) : masqués ici plutôt que soumis avec leur
// valeur inchangée, qui déclencherait quand même l'erreur (le backend
// rejette dès que le champ est présent dans le body, indépendamment de sa
// valeur).
export function MatchEditDialog({
  clubId,
  teamId,
  match,
  trigger,
  onSuccess,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  clubId: string;
  teamId: string;
  match: EditableMatch;
  trigger?: ReactElement;
  onSuccess: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("matchDetail");
  const tCalendar = useTranslations("calendar");
  const tMatches = useTranslations("matches");
  const tExternal = useTranslations("externalTeams");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChangeProp ?? setInternalOpen;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [externalTeams, setExternalTeams] = useState<MatchOpponentOption[] | null>(null);

  const showOpponentFields = match.matchType !== "CHAMPIONNAT";

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

  const loadExternalTeams = useCallback(async () => {
    try {
      const response = await apiFetch(`/clubs/${clubId}/external-teams?teamId=${teamId}`, {
        headers: authHeaders(accessToken),
      });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as { data: MatchOpponentOption[] };
      setExternalTeams(body.data);
    } catch {
      toast.error(tExternal("loadFailed"));
    }
  }, [clubId, teamId, accessToken, tExternal]);

  useEffect(() => {
    if (open) {
      reset(defaultValues(match));
      if (showOpponentFields) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadExternalTeams();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, match]);

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    const headers = authHeaders(accessToken);
    const body = JSON.stringify({
      title: values.title,
      startAt: toIso(values.startAt),
      endAt: values.endAt ? toIso(values.endAt) : undefined,
      location: toOptionalText(values.location ?? ""),
      description: toOptionalText(values.description ?? ""),
      gameFormat: values.gameFormat,
      ...(showOpponentFields
        ? {
            homeOrAway: values.homeOrAway,
            opponentExternalTeamId: values.opponentExternalTeamId
              ? Number(values.opponentExternalTeamId)
              : undefined,
            cupRound: match.matchType === "COUPE" ? values.cupRound : undefined,
          }
        : {}),
    });
    try {
      const response = await apiFetch(`/clubs/${clubId}/teams/${teamId}/matches/${match.id}`, {
        method: "PATCH",
        headers,
        body,
      });
      if (!response.ok) throw new Error(await parseErrorCode(response));

      toast.success(t("updated"));
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
      <DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="match-edit-title">{tCalendar("titleLabel")}</Label>
            <Input id="match-edit-title" {...register("title")} />
            {errors.title && (
              <p className="text-sm text-destructive">{tCalendar("titleRequired")}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="match-edit-startAt">{tCalendar("startAt")}</Label>
              <Input
                id="match-edit-startAt"
                type="datetime-local"
                {...register("startAt")}
              />
              {errors.startAt && (
                <p className="text-sm text-destructive">{tCalendar("startAtRequired")}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="match-edit-endAt">{tCalendar("endAt")}</Label>
              <Input id="match-edit-endAt" type="datetime-local" {...register("endAt")} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="match-edit-location">{tCalendar("location")}</Label>
            <Input id="match-edit-location" {...register("location")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="match-edit-description">{tCalendar("description")}</Label>
            <Textarea id="match-edit-description" {...register("description")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{tMatches("gameFormat")}</Label>
            <Controller
              control={control}
              name="gameFormat"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full" aria-label={tMatches("gameFormat")}>
                    <SelectValue>
                      {(v: string | null) =>
                        v
                          ? `${GAME_FORMAT_PLAYER_COUNT[v as GameFormat]} vs ${GAME_FORMAT_PLAYER_COUNT[v as GameFormat]}`
                          : ""
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {GAME_FORMATS.map((format) => (
                      <SelectItem key={format} value={format}>
                        {`${GAME_FORMAT_PLAYER_COUNT[format]} vs ${GAME_FORMAT_PLAYER_COUNT[format]}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {showOpponentFields && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>{tMatches("homeOrAway")}</Label>
                <Controller
                  control={control}
                  name="homeOrAway"
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full" aria-label={tMatches("homeOrAway")}>
                        <SelectValue>
                          {(v: string | null) => (v ? tMatches(`homeOrAway${v}`) : "")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="HOME">{tMatches("homeOrAwayHOME")}</SelectItem>
                        <SelectItem value="AWAY">{tMatches("homeOrAwayAWAY")}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {match.matchType === "COUPE" && (
                <div className="flex flex-col gap-1.5">
                  <Label>{tMatches("cupRound")}</Label>
                  <Controller
                    control={control}
                    name="cupRound"
                    render={({ field }) => (
                      <Select value={field.value ?? ""} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full" aria-label={tMatches("cupRound")}>
                          <SelectValue>
                            {(v: string | null) =>
                              v ? tMatches(`cupRound${v}`) : tMatches("selectCupRound")
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {CUP_ROUNDS.map((round) => (
                            <SelectItem key={round} value={round}>
                              {tMatches(`cupRound${round}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label>{tMatches("opponent")}</Label>
                <Controller
                  control={control}
                  name="opponentExternalTeamId"
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full" aria-label={tMatches("opponent")}>
                        <SelectValue>
                          {(v: string | null) =>
                            externalTeams?.find((team) => String(team.id) === v)?.name ??
                            tMatches("selectOpponent")
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(externalTeams ?? []).map((team) => (
                          <SelectItem key={team.id} value={String(team.id)}>
                            {team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <ExternalTeamFormDialog
                  clubId={clubId}
                  teamId={teamId}
                  onSuccess={loadExternalTeams}
                  trigger={
                    <Button type="button" variant="ghost" size="sm" className="w-fit">
                      {tExternal("addButton")}
                    </Button>
                  }
                />
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {t("submitEdit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
