"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import {
  Controller,
  useForm,
  useWatch,
  type Control,
  type FieldErrors,
} from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DeleteEventDialog } from "@/components/calendar/delete-event-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ExternalTeamFormDialog } from "@/components/championships/external-team-form-dialog";
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
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { EVENT_TYPES, type EventType } from "@/lib/event";
import { GAME_FORMATS, GAME_FORMAT_PLAYER_COUNT, type GameFormat } from "@/lib/formations";
import { CATEGORY_DEFAULT_GAME_FORMAT } from "@/lib/game-formats";
import type { TeamCategory } from "@/lib/team-categories";
import { cn } from "@/lib/utils";
import {
  computeOccurrenceDates,
  MAX_OCCURRENCES,
  ORDINALS,
  WEEKDAYS,
  type Ordinal,
  type RecurrenceRule,
  type Weekday,
} from "@/lib/recurrence";

export interface EventFormTeam {
  id: number;
  name: string;
  // Optionnel : seul le préremplissage du format de jeu suggéré (B10, voir
  // `initialGameFormat` ci-dessous) en a besoin — la plupart des appelants
  // (vues calendrier, dialogues de suppression...) n'ont besoin que de
  // id/name et n'ont pas à porter cette donnée.
  category?: TeamCategory | null;
}

export interface ExistingEvent {
  id: number;
  type: EventType;
  title: string;
  startAt: string;
  endAt: string | null;
  location: string | null;
  description: string | null;
  isRecurring: boolean;
  team: EventFormTeam;
  // Présent uniquement pour type = MATCH (Phase 4) — l'id de la fiche Match
  // liée, nécessaire pour construire le lien "Voir le match" (docs/modules/
  // matchs.md §Affichage dans le Calendrier) plutôt que d'ouvrir le
  // dialogue générique désormais désactivé pour ce type.
  match?: { id: number } | null;
}

const RECURRENCE_TYPES = ["weekly", "monthly", "yearly"] as const;

// Match CHAMPIONNAT exclu (docs/modules/matchs.md) : jamais créé directement
// depuis le Calendrier, seulement via le module Championnat (auto-création
// Event+Match, A3).
export const CREATABLE_MATCH_TYPES = ["COUPE", "AMICAL", "TOURNOI"] as const;
export const CUP_ROUNDS = [
  "ROUND_OF_128",
  "ROUND_OF_64",
  "ROUND_OF_32",
  "ROUND_OF_16",
  "QUARTER_FINAL",
  "SEMI_FINAL",
  "FINAL",
] as const;

const formSchema = z
  .object({
    teamId: z.string().min(1),
    type: z.string().min(1),
    title: z.string().min(1),
    startAt: z.string().optional(),
    endAt: z.string().optional(),
    location: z.string().optional(),
    description: z.string().optional(),
    isRecurring: z.boolean(),
    // Champ interne, jamais affiché ni envoyé à l'API : distingue création/
    // édition dans superRefine ci-dessous (les champs match ne sont exigés
    // qu'en création — MATCH est aussi une valeur historique de `type` pour
    // des événements édités sans fiche Match, voir ExistingEvent).
    isCreateMode: z.boolean(),
    matchType: z.string().optional(),
    opponentExternalTeamId: z.string().optional(),
    cupRound: z.string().optional(),
    homeOrAway: z.string().optional(),
    gameFormat: z.string().optional(),
    recurrenceType: z.enum(RECURRENCE_TYPES),
    recurrenceWeekdays: z.array(z.string()),
    recurrenceMonthlyMode: z.enum(["dayOfMonth", "weekdayOrdinal"]),
    recurrenceDayOfMonth: z.string().optional(),
    recurrenceOrdinal: z.string(),
    recurrenceWeekday: z.string(),
    recurrenceYearlyMode: z.enum(["fixedDate", "weekdayOrdinal"]),
    recurrenceMonth: z.string(),
    recurrenceDay: z.string().optional(),
    recurrenceStartTime: z.string().optional(),
    recurrenceEndTime: z.string().optional(),
    recurrenceRangeStart: z.string().optional(),
    recurrenceRangeEnd: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.isRecurring) {
      if (!data.startAt) {
        ctx.addIssue({ code: "custom", path: ["startAt"], message: "required" });
      }
      // Un match ne se crée jamais en récurrence (docs/modules/matchs.md) —
      // case masquée à l'écran, validé ici en défense supplémentaire. Ne
      // s'applique qu'en création : MATCH est aussi une valeur historique de
      // `type` pour des événements édités sans fiche Match associée.
      if (data.isCreateMode && data.type === "MATCH") {
        if (!data.matchType) {
          ctx.addIssue({ code: "custom", path: ["matchType"], message: "required" });
        }
        if (!data.opponentExternalTeamId) {
          ctx.addIssue({
            code: "custom",
            path: ["opponentExternalTeamId"],
            message: "required",
          });
        }
        if (!data.homeOrAway) {
          ctx.addIssue({ code: "custom", path: ["homeOrAway"], message: "required" });
        }
        if (!data.gameFormat) {
          ctx.addIssue({ code: "custom", path: ["gameFormat"], message: "required" });
        }
        if (data.matchType === "COUPE" && !data.cupRound) {
          ctx.addIssue({ code: "custom", path: ["cupRound"], message: "required" });
        }
      }
      return;
    }
    if (!data.recurrenceStartTime) {
      ctx.addIssue({ code: "custom", path: ["recurrenceStartTime"], message: "required" });
    }
    if (!data.recurrenceRangeStart) {
      ctx.addIssue({ code: "custom", path: ["recurrenceRangeStart"], message: "required" });
    }
    if (!data.recurrenceRangeEnd) {
      ctx.addIssue({ code: "custom", path: ["recurrenceRangeEnd"], message: "required" });
    }
    if (data.recurrenceType === "weekly" && data.recurrenceWeekdays.length === 0) {
      ctx.addIssue({ code: "custom", path: ["recurrenceWeekdays"], message: "required" });
    }
    if (
      data.recurrenceType === "monthly" &&
      data.recurrenceMonthlyMode === "dayOfMonth" &&
      !data.recurrenceDayOfMonth
    ) {
      ctx.addIssue({ code: "custom", path: ["recurrenceDayOfMonth"], message: "required" });
    }
    if (
      data.recurrenceType === "yearly" &&
      data.recurrenceYearlyMode === "fixedDate" &&
      !data.recurrenceDay
    ) {
      ctx.addIssue({ code: "custom", path: ["recurrenceDay"], message: "required" });
    }
  });

type FormValues = z.infer<typeof formSchema>;

// L'input natif <input type="datetime-local"> attend "AAAA-MM-JJTHH:mm" en
// heure locale (pas d'offset) — conversion aller-retour avec l'ISO renvoyé
// par le backend, ou depuis une Date passée directement (clic/glisser sur
// la grille mensuelle, voir defaultDate/defaultEndDate ci-dessous).
function toDatetimeLocalValue(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIso(value: string): string {
  return new Date(value).toISOString();
}

function toOptionalText(value?: string): string | undefined {
  return value && value.trim() !== "" ? value : undefined;
}

// Heure par défaut pour une date posée sans heure précise (clic sur une
// cellule de jour en vue Mensuelle, toujours à minuit) : 9h locale,
// modifiable ensuite dans le formulaire. Une date qui porte déjà une heure
// précise (clic dans la grille horaire de la vue Hebdomadaire) est
// conservée telle quelle.
function atDefaultHour(date: Date): Date {
  if (date.getHours() !== 0 || date.getMinutes() !== 0) {
    return date;
  }
  const withHour = new Date(date);
  withHour.setHours(9, 0, 0, 0);
  return withHour;
}

// "AAAA-MM-JJ" (input date) → Date locale à minuit — jamais new Date(value)
// seul, qui parse en UTC et peut décaler d'un jour selon le fuseau local.
function parseDateInputValue(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function combineDateAndTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes || 0, 0, 0);
  return result;
}

// Libellés courts des jours de semaine / longs des mois, dérivés de l'API
// Intl plutôt que codés en dur — cohérent avec CalendarMonthView/WeekView.
function buildWeekdayLabels(locale: string): string[] {
  // 2024-01-01 est un lundi : point de départ arbitraire pour dériver les 7
  // jours dans l'ordre lundi→dimanche (même convention que lib/calendar-grid.ts).
  return WEEKDAYS.map((i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: "short" }),
  );
}

function buildMonthLabels(locale: string): string[] {
  return Array.from({ length: 12 }, (_, i) =>
    new Date(2024, i, 1).toLocaleDateString(locale, { month: "long" }),
  );
}

// Préremplissage du format de jeu depuis la catégorie de l'équipe
// initialement sélectionnée (docs/modules/matchs.md §Format de jeu, B10) —
// seulement à l'ouverture, pas de mise à jour réactive si l'utilisateur
// change ensuite l'équipe via le sélecteur (même niveau de simplicité que
// matchType/homeOrAway, valeurs par défaut fixes elles aussi).
function initialGameFormat(teams: EventFormTeam[]): GameFormat {
  const category = teams[0]?.category;
  return category ? CATEGORY_DEFAULT_GAME_FORMAT[category] : "ELEVEN";
}

function defaultValues(
  teams: EventFormTeam[],
  event?: ExistingEvent,
  defaultDate?: Date,
  defaultEndDate?: Date,
): FormValues {
  return {
    teamId: String(event?.team.id ?? teams[0]?.id ?? ""),
    type: event?.type ?? "TRAINING",
    title: event?.title ?? "",
    startAt: event
      ? toDatetimeLocalValue(event.startAt)
      : defaultDate
        ? toDatetimeLocalValue(atDefaultHour(defaultDate))
        : "",
    endAt: event?.endAt
      ? toDatetimeLocalValue(event.endAt)
      : defaultEndDate
        ? toDatetimeLocalValue(atDefaultHour(defaultEndDate))
        : "",
    location: event?.location ?? "",
    description: event?.description ?? "",
    isCreateMode: !event,
    matchType: "AMICAL",
    opponentExternalTeamId: "",
    cupRound: undefined,
    homeOrAway: "HOME",
    gameFormat: initialGameFormat(teams),
    isRecurring: false,
    recurrenceType: "weekly",
    recurrenceWeekdays: [],
    recurrenceMonthlyMode: "dayOfMonth",
    recurrenceDayOfMonth: "",
    recurrenceOrdinal: "1",
    recurrenceWeekday: "0",
    recurrenceYearlyMode: "fixedDate",
    recurrenceMonth: "1",
    recurrenceDay: "",
    recurrenceStartTime: "",
    recurrenceEndTime: "",
    recurrenceRangeStart: "",
    recurrenceRangeEnd: "",
  };
}

// Construit la règle de récurrence à partir des valeurs du formulaire —
// undefined si les champs requis pour le type sélectionné ne sont pas
// encore renseignés (aperçu à blanc plutôt qu'une erreur pendant la saisie).
function buildRuleFromForm(values: FormValues): RecurrenceRule | undefined {
  if (values.recurrenceType === "weekly") {
    if (values.recurrenceWeekdays.length === 0) return undefined;
    return {
      type: "weekly",
      weekdays: values.recurrenceWeekdays.map((w) => Number(w) as Weekday),
    };
  }
  if (values.recurrenceType === "monthly") {
    if (values.recurrenceMonthlyMode === "dayOfMonth") {
      if (!values.recurrenceDayOfMonth) return undefined;
      return {
        type: "monthly",
        mode: "dayOfMonth",
        dayOfMonth: Number(values.recurrenceDayOfMonth),
      };
    }
    return {
      type: "monthly",
      mode: "weekdayOrdinal",
      ordinal: Number(values.recurrenceOrdinal) as Ordinal,
      weekday: Number(values.recurrenceWeekday) as Weekday,
    };
  }
  // yearly
  if (values.recurrenceYearlyMode === "fixedDate") {
    if (!values.recurrenceDay) return undefined;
    return {
      type: "yearly",
      mode: "fixedDate",
      month: Number(values.recurrenceMonth),
      day: Number(values.recurrenceDay),
    };
  }
  return {
    type: "yearly",
    mode: "weekdayOrdinal",
    ordinal: Number(values.recurrenceOrdinal) as Ordinal,
    weekday: Number(values.recurrenceWeekday) as Weekday,
    month: Number(values.recurrenceMonth),
  };
}

export function EventFormDialog({
  clubId,
  teams,
  trigger,
  event,
  defaultDate,
  defaultEndDate,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  onSuccess,
}: {
  clubId: string;
  teams: EventFormTeam[];
  // Optionnel : sans trigger, le dialogue est piloté en externe via
  // open/onOpenChange (voir CalendarMonthView — clic/glisser sur une
  // cellule, pas de bouton visible pour déclencher l'ouverture).
  trigger?: ReactElement;
  event?: ExistingEvent;
  // Pré-remplit startAt/endAt en mode création (clic/glisser sur la grille
  // mensuelle) — ignorés en mode édition.
  defaultDate?: Date;
  defaultEndDate?: Date;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const mode = event ? "edit" : "create";
  const t = useTranslations("calendar");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const { accessToken } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Édition d'un événement récurrent (docs/schema/evenements.md §Événements
  // récurrents) : la soumission du formulaire ne PATCH pas immédiatement,
  // elle met les valeurs en attente le temps que l'utilisateur choisisse
  // "cet événement seulement" ou "cet événement et les suivants" — jamais
  // les occurrences passées.
  const [pendingEditValues, setPendingEditValues] = useState<FormValues | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(teams, event, defaultDate, defaultEndDate),
  });

  const setOpen = (nextOpen: boolean) => {
    setInternalOpen(nextOpen);
    onOpenChangeProp?.(nextOpen);
  };

  // Réinitialise le formulaire à chaque ouverture — y compris pilotée en
  // externe (open contrôlé change sans passer par handleOpenChange, ex.
  // CalendarMonthView qui rouvre le même dialogue pour un event/une date
  // différente à chaque clic).
  useEffect(() => {
    if (open) {
      reset(defaultValues(teams, event, defaultDate, defaultEndDate));
      // Sécurité en cas de réouverture pilotée en externe (CalendarMonthView) :
      // performSubmit et le choix "Annuler" remettent déjà pendingEditValues à
      // null dans tous les autres cas.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingEditValues(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event, defaultDate, defaultEndDate]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
  };

  const watched = useWatch({ control });
  const weekdayLabels = useMemo(() => buildWeekdayLabels(locale), [locale]);
  const monthLabels = useMemo(() => buildMonthLabels(locale), [locale]);
  const ordinalLabels: Record<Ordinal, string> = {
    1: t("ordinal1"),
    2: t("ordinal2"),
    3: t("ordinal3"),
    4: t("ordinal4"),
    [-1]: t("ordinalLast"),
  };

  // Aperçu du nombre d'occurrences — recalculé à chaque changement de règle,
  // pas seulement à la soumission, pour que l'utilisateur voie l'effet de
  // son choix avant de valider.
  const occurrenceDates = useMemo(() => {
    if (!watched.isRecurring || !watched.recurrenceRangeStart || !watched.recurrenceRangeEnd) {
      return [];
    }
    const rule = buildRuleFromForm(watched as FormValues);
    if (!rule) return [];
    return computeOccurrenceDates(
      rule,
      parseDateInputValue(watched.recurrenceRangeStart),
      parseDateInputValue(watched.recurrenceRangeEnd),
    );
  }, [watched]);

  // Suppression accessible depuis ce même dialogue d'édition (mois/semaine/
  // liste l'ouvrent toutes via ce composant, voir CalendarPageContent) —
  // seul point d'entrée jusqu'ici était la vue Liste (DeleteEventDialog déjà
  // utilisé là-bas, même flux de confirmation réutilisé ici).
  const handleDelete = async (scope: "single" | "future") => {
    const headers = authHeaders(accessToken);
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${event!.team.id}/events/${event!.id}?scope=${scope}`,
        { method: "DELETE", headers },
      );
      if (!response.ok) throw new Error();
      setOpen(false);
      onSuccess();
    } catch {
      toast.error(t("deleteFailed"));
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (mode === "edit" && event!.isRecurring) {
      setPendingEditValues(values);
      return;
    }

    await performSubmit(values);
  };

  const performSubmit = async (values: FormValues, scope: "single" | "future" = "single") => {
    setIsSubmitting(true);
    const headers = authHeaders(accessToken);

    if (values.isRecurring) {
      const rule = buildRuleFromForm(values);
      const dates =
        rule && values.recurrenceRangeStart && values.recurrenceRangeEnd
          ? computeOccurrenceDates(
              rule,
              parseDateInputValue(values.recurrenceRangeStart),
              parseDateInputValue(values.recurrenceRangeEnd),
            )
          : [];
      if (dates.length === 0) {
        toast.error(t("recurrenceNoOccurrences"));
        setIsSubmitting(false);
        return;
      }
      if (dates.length > MAX_OCCURRENCES) {
        toast.error(t("recurrenceTooMany", { max: MAX_OCCURRENCES }));
        setIsSubmitting(false);
        return;
      }
      const events = dates.map((date) => ({
        type: values.type,
        title: values.title,
        startAt: combineDateAndTime(date, values.recurrenceStartTime!).toISOString(),
        endAt: values.recurrenceEndTime
          ? combineDateAndTime(date, values.recurrenceEndTime).toISOString()
          : undefined,
        location: toOptionalText(values.location),
        description: toOptionalText(values.description),
      }));
      try {
        const response = await apiFetch(`/clubs/${clubId}/teams/${values.teamId}/events/bulk`, {
          method: "POST",
          headers,
          body: JSON.stringify({ events }),
        });
        if (!response.ok) throw new Error(await parseErrorCode(response));
        toast.success(t("createdRecurring", { count: dates.length }));
        setOpen(false);
        onSuccess();
      } catch (error) {
        const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
        toast.error(tErrors(code));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Match (COUPE/AMICAL/TOURNOI, création uniquement — docs/modules/matchs.md) :
    // route dédiée, crée l'Event+Match en une transaction backend. Un match
    // CHAMPIONNAT n'est jamais créable ici (case exclue du sélecteur), et
    // l'édition d'un match existant n'est pas encore prise en charge par ce
    // dialogue générique (arrivera avec la fiche match, Parties B-D).
    if (mode === "create" && values.type === "MATCH") {
      const matchBody = JSON.stringify({
        title: values.title,
        startAt: toIso(values.startAt!),
        endAt: values.endAt ? toIso(values.endAt) : undefined,
        location: toOptionalText(values.location),
        description: toOptionalText(values.description),
        matchType: values.matchType,
        opponentExternalTeamId: Number(values.opponentExternalTeamId),
        cupRound: values.matchType === "COUPE" ? values.cupRound : undefined,
        homeOrAway: values.homeOrAway,
        gameFormat: values.gameFormat,
      });
      try {
        const response = await apiFetch(`/clubs/${clubId}/teams/${values.teamId}/matches`, {
          method: "POST",
          headers,
          body: matchBody,
        });
        if (!response.ok) throw new Error(await parseErrorCode(response));
        toast.success(t("matchCreated"));
        setOpen(false);
        onSuccess();
      } catch (error) {
        const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
        toast.error(tErrors(code));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const body = JSON.stringify({
      type: values.type,
      title: values.title,
      startAt: toIso(values.startAt!),
      endAt: values.endAt ? toIso(values.endAt) : undefined,
      location: toOptionalText(values.location),
      description: toOptionalText(values.description),
    });
    try {
      const response =
        mode === "create"
          ? await apiFetch(`/clubs/${clubId}/teams/${values.teamId}/events`, {
              method: "POST",
              headers,
              body,
            })
          : await apiFetch(
              `/clubs/${clubId}/teams/${event!.team.id}/events/${event!.id}?scope=${scope}`,
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
      setPendingEditValues(null);
    }
  };

  const isRecurring = !!watched.isRecurring;
  const recurrenceType = watched.recurrenceType ?? "weekly";
  const recurrenceMonthlyMode = watched.recurrenceMonthlyMode ?? "dayOfMonth";
  const recurrenceYearlyMode = watched.recurrenceYearlyMode ?? "fixedDate";
  const isMatchType = watched.type === "MATCH";
  // L'édition d'un match existant n'est pas prise en charge par ce dialogue
  // générique (voir performSubmit) — MATCH n'est donc sélectionnable qu'en
  // création.
  const selectableEventTypes = mode === "create" ? EVENT_TYPES : EVENT_TYPES.filter((type) => type !== "MATCH");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("createTitle") : t("editTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {/* Une seule équipe accessible en création : pas de sélecteur
              d'équipe affiché (voir branche ci-dessous) — le champ Type
              occupe alors seul toute la largeur plutôt que la moitié d'une
              grille à 2 colonnes avec une case vide. */}
          <div className={cn("grid gap-3", mode === "edit" || teams.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
            {mode === "create" && teams.length > 1 ? (
              <div className="flex flex-col gap-1.5">
                <Label>{t("team")}</Label>
                <Controller
                  control={control}
                  name="teamId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(v: string | null) =>
                            teams.find((team) => String(team.id) === v)?.name ?? ""
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {teams.map((team) => (
                          <SelectItem key={team.id} value={String(team.id)}>
                            {team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            ) : mode === "edit" ? (
              <div className="flex flex-col gap-1.5">
                <Label>{t("team")}</Label>
                <p className="text-sm text-muted-foreground">{event!.team.name}</p>
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label>{t("type")}</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{(v: string | null) => (v ? t(`type${v}`) : "")}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {selectableEventTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {t(`type${type}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-title">{t("titleLabel")}</Label>
            <Input id="event-title" {...register("title")} />
            {errors.title && <p className="text-sm text-destructive">{t("titleRequired")}</p>}
          </div>

          {mode === "create" && !isMatchType && (
            <label className="flex items-center gap-2 text-sm">
              <Controller
                control={control}
                name="isRecurring"
                render={({ field }) => (
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked)}
                  />
                )}
              />
              {t("recurring")}
            </label>
          )}

          {!isRecurring || mode === "edit" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="event-start-at">{t("startAt")}</Label>
                <Input id="event-start-at" type="datetime-local" {...register("startAt")} />
                {errors.startAt && (
                  <p className="text-sm text-destructive">{t("startAtRequired")}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="event-end-at">{t("endAt")}</Label>
                <Input id="event-end-at" type="datetime-local" {...register("endAt")} />
              </div>
            </div>
          ) : null}

          {mode === "create" && isMatchType && (
            <MatchEventFields
              clubId={clubId}
              teamId={watched.teamId ?? ""}
              control={control}
              errors={errors}
              matchType={watched.matchType}
              onOpponentSelected={(name) => {
                if (!getValues("title")) setValue("title", name);
              }}
            />
          )}

          {!isMatchType && isRecurring && mode === "create" ? (
            <div className="flex flex-col gap-3 rounded-md border p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="recurrence-start-time">{t("recurrenceStartTime")}</Label>
                  <Input
                    id="recurrence-start-time"
                    type="time"
                    {...register("recurrenceStartTime")}
                  />
                  {errors.recurrenceStartTime && (
                    <p className="text-sm text-destructive">{t("recurrenceStartTimeRequired")}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="recurrence-end-time">{t("recurrenceEndTime")}</Label>
                  <Input id="recurrence-end-time" type="time" {...register("recurrenceEndTime")} />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>{t("recurrenceType")}</Label>
                <Controller
                  control={control}
                  name="recurrenceType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(v: string | null) => (v ? t(`recurrenceType${v}`) : "")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {RECURRENCE_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {t(`recurrenceType${type}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {recurrenceType === "weekly" && (
                <div className="flex flex-col gap-1.5">
                  <Label>{t("recurrenceWeekdays")}</Label>
                  <Controller
                    control={control}
                    name="recurrenceWeekdays"
                    render={({ field }) => (
                      <div className="flex flex-wrap gap-3">
                        {WEEKDAYS.map((weekday) => {
                          const value = String(weekday);
                          const checked = field.value.includes(value);
                          return (
                            <label key={weekday} className="flex items-center gap-1.5 text-sm">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => {
                                  field.onChange(
                                    checked
                                      ? field.value.filter((v: string) => v !== value)
                                      : [...field.value, value],
                                  );
                                }}
                              />
                              {weekdayLabels[weekday]}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  />
                  {errors.recurrenceWeekdays && (
                    <p className="text-sm text-destructive">{t("recurrenceWeekdaysRequired")}</p>
                  )}
                </div>
              )}

              {recurrenceType === "monthly" && (
                <div className="flex flex-col gap-2">
                  <Controller
                    control={control}
                    name="recurrenceMonthlyMode"
                    render={({ field }) => (
                      <div className="flex gap-4 text-sm">
                        <label className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            checked={field.value === "dayOfMonth"}
                            onChange={() => field.onChange("dayOfMonth")}
                          />
                          {t("recurrenceMonthlyModeDayOfMonth")}
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            checked={field.value === "weekdayOrdinal"}
                            onChange={() => field.onChange("weekdayOrdinal")}
                          />
                          {t("recurrenceMonthlyModeWeekdayOrdinal")}
                        </label>
                      </div>
                    )}
                  />
                  {recurrenceMonthlyMode === "dayOfMonth" ? (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="recurrence-day-of-month">{t("recurrenceDayOfMonth")}</Label>
                      <Input
                        id="recurrence-day-of-month"
                        type="number"
                        min={1}
                        max={31}
                        {...register("recurrenceDayOfMonth")}
                      />
                      {errors.recurrenceDayOfMonth && (
                        <p className="text-sm text-destructive">
                          {t("recurrenceDayOfMonthRequired")}
                        </p>
                      )}
                    </div>
                  ) : (
                    <OrdinalWeekdayFields
                      control={control}
                      ordinalLabels={ordinalLabels}
                      weekdayLabels={weekdayLabels}
                    />
                  )}
                </div>
              )}

              {recurrenceType === "yearly" && (
                <div className="flex flex-col gap-2">
                  <Controller
                    control={control}
                    name="recurrenceYearlyMode"
                    render={({ field }) => (
                      <div className="flex gap-4 text-sm">
                        <label className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            checked={field.value === "fixedDate"}
                            onChange={() => field.onChange("fixedDate")}
                          />
                          {t("recurrenceYearlyModeFixedDate")}
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            checked={field.value === "weekdayOrdinal"}
                            onChange={() => field.onChange("weekdayOrdinal")}
                          />
                          {t("recurrenceYearlyModeWeekdayOrdinal")}
                        </label>
                      </div>
                    )}
                  />
                  {recurrenceYearlyMode === "fixedDate" ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="recurrence-day">{t("recurrenceDay")}</Label>
                        <Input
                          id="recurrence-day"
                          type="number"
                          min={1}
                          max={31}
                          {...register("recurrenceDay")}
                        />
                        {errors.recurrenceDay && (
                          <p className="text-sm text-destructive">{t("recurrenceDayRequired")}</p>
                        )}
                      </div>
                      <MonthSelectField control={control} monthLabels={monthLabels} />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <OrdinalWeekdayFields
                        control={control}
                        ordinalLabels={ordinalLabels}
                        weekdayLabels={weekdayLabels}
                      />
                      <MonthSelectField control={control} monthLabels={monthLabels} />
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="recurrence-range-start">{t("recurrenceRangeStart")}</Label>
                  <Input
                    id="recurrence-range-start"
                    type="date"
                    {...register("recurrenceRangeStart")}
                  />
                  {errors.recurrenceRangeStart && (
                    <p className="text-sm text-destructive">{t("recurrenceRangeRequired")}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="recurrence-range-end">{t("recurrenceRangeEnd")}</Label>
                  <Input
                    id="recurrence-range-end"
                    type="date"
                    {...register("recurrenceRangeEnd")}
                  />
                  {errors.recurrenceRangeEnd && (
                    <p className="text-sm text-destructive">{t("recurrenceRangeRequired")}</p>
                  )}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {occurrenceDates.length > MAX_OCCURRENCES
                  ? t("recurrenceTooMany", { max: MAX_OCCURRENCES })
                  : t("recurrenceOccurrenceCount", { count: occurrenceDates.length })}
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-location">{t("location")}</Label>
            <Input id="event-location" {...register("location")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-description">{t("description")}</Label>
            <Textarea id="event-description" rows={3} {...register("description")} />
          </div>

          <DialogFooter className={mode === "edit" ? "sm:justify-between" : undefined}>
            {mode === "edit" && (
              <DeleteEventDialog
                event={event!}
                onConfirm={(scope) => void handleDelete(scope)}
                trigger={
                  <Button type="button" variant="destructive">
                    {t("delete")}
                  </Button>
                }
              />
            )}
            <Button type="submit" disabled={isSubmitting}>
              {mode === "create" ? t("submitCreate") : t("submitEdit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      {/* Édition d'un événement récurrent : choix du périmètre avant le
          PATCH réel (voir performSubmit et docs/schema/evenements.md). */}
      <AlertDialog
        open={pendingEditValues !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingEditValues(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("editScopeDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("editScopeDialogDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          {/* 3 choix avec des libellés longs : jamais sur une seule ligne
              (débordait du cadre de la modale à sm:flex-row) — empilés en
              pleine largeur à tous les gabarits. */}
          <AlertDialogFooter className="sm:flex-col-reverse">
            <AlertDialogClose render={<Button variant="outline" className="w-full">{t("cancel")}</Button>} />
            <AlertDialogClose
              render={
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => pendingEditValues && void performSubmit(pendingEditValues, "single")}
                >
                  {t("scopeSingleOccurrence")}
                </Button>
              }
            />
            <AlertDialogClose
              render={
                <Button
                  className="w-full"
                  onClick={() => pendingEditValues && void performSubmit(pendingEditValues, "future")}
                >
                  {t("scopeFutureOccurrences")}
                </Button>
              }
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

// Champs partagés "Nième jour de semaine" (mensuel/annuel en mode
// weekdayOrdinal) — factorisés pour éviter la duplication entre les deux
// blocs de règle.
function OrdinalWeekdayFields({
  control,
  ordinalLabels,
  weekdayLabels,
}: {
  control: Control<FormValues>;
  ordinalLabels: Record<Ordinal, string>;
  weekdayLabels: string[];
}) {
  const t = useTranslations("calendar");
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1.5">
        <Label>{t("recurrenceOrdinal")}</Label>
        <Controller
          control={control}
          name="recurrenceOrdinal"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v: string | null) => (v ? ordinalLabels[Number(v) as Ordinal] : "")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ORDINALS.map((ordinal) => (
                  <SelectItem key={ordinal} value={String(ordinal)}>
                    {ordinalLabels[ordinal]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{t("recurrenceWeekday")}</Label>
        <Controller
          control={control}
          name="recurrenceWeekday"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v: string | null) => (v ? weekdayLabels[Number(v)] : "")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((weekday) => (
                  <SelectItem key={weekday} value={String(weekday)}>
                    {weekdayLabels[weekday]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
    </div>
  );
}

function MonthSelectField({
  control,
  monthLabels,
}: {
  control: Control<FormValues>;
  monthLabels: string[];
}) {
  const t = useTranslations("calendar");
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{t("recurrenceMonth")}</Label>
      <Controller
        control={control}
        name="recurrenceMonth"
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger className="w-full">
              <SelectValue>{(v: string | null) => (v ? monthLabels[Number(v) - 1] : "")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {monthLabels.map((label, index) => (
                <SelectItem key={label} value={String(index + 1)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  );
}

interface MatchOpponentOption {
  id: number;
  name: string;
}

// Sous-formulaire affiché quand type = MATCH, en création uniquement
// (docs/modules/matchs.md) : un match CHAMPIONNAT ne se crée jamais depuis
// le Calendrier (CREATABLE_MATCH_TYPES l'exclut), seulement via le module
// Championnat (auto-création Event+Match, A3). Adversaire choisi dans la
// liste ExternalTeam du club (existante ou créée à la volée) — même
// flux/composant que AddParticipantDialog (module Championnat, Partie B).
function MatchEventFields({
  clubId,
  teamId,
  control,
  errors,
  matchType,
  onOpponentSelected,
}: {
  clubId: string;
  teamId: string;
  control: Control<FormValues>;
  errors: FieldErrors<FormValues>;
  matchType?: string;
  onOpponentSelected: (name: string) => void;
}) {
  const t = useTranslations("matches");
  const tExternal = useTranslations("externalTeams");
  const { accessToken } = useAuth();
  const [externalTeams, setExternalTeams] = useState<MatchOpponentOption[] | null>(null);

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
    if (teamId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadExternalTeams();
    }
  }, [teamId, loadExternalTeams]);

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>{t("type")}</Label>
          <Controller
            control={control}
            name="matchType"
            render={({ field }) => (
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: string | null) => (v ? t(`type${v}`) : "")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CREATABLE_MATCH_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`type${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t("homeOrAway")}</Label>
          <Controller
            control={control}
            name="homeOrAway"
            render={({ field }) => (
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: string | null) => (v ? t(`homeOrAway${v}`) : "")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HOME">{t("homeOrAwayHOME")}</SelectItem>
                  <SelectItem value="AWAY">{t("homeOrAwayAWAY")}</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t("gameFormat")}</Label>
        <Controller
          control={control}
          name="gameFormat"
          render={({ field }) => (
            <Select value={field.value ?? ""} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
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

      {matchType === "COUPE" && (
        <div className="flex flex-col gap-1.5">
          <Label>{t("cupRound")}</Label>
          <Controller
            control={control}
            name="cupRound"
            render={({ field }) => (
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string | null) => (v ? t(`cupRound${v}`) : t("selectCupRound"))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CUP_ROUNDS.map((round) => (
                    <SelectItem key={round} value={round}>
                      {t(`cupRound${round}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.cupRound && <p className="text-sm text-destructive">{t("cupRoundRequired")}</p>}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label>{t("opponent")}</Label>
        <Controller
          control={control}
          name="opponentExternalTeamId"
          render={({ field }) => (
            <Select
              value={field.value ?? ""}
              onValueChange={(value) => {
                field.onChange(value);
                const opponent = externalTeams?.find((team) => String(team.id) === value);
                if (opponent) onOpponentSelected(opponent.name);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v: string | null) =>
                    externalTeams?.find((team) => String(team.id) === v)?.name ??
                    t("selectOpponent")
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
        {errors.opponentExternalTeamId && (
          <p className="text-sm text-destructive">{t("opponentRequired")}</p>
        )}
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
    </div>
  );
}
