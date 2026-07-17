"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDown, ArrowUp, X } from "lucide-react";
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
import { useRouter } from "@/i18n/navigation";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { GAME_FORMATS, GAME_FORMAT_PLAYER_COUNT, type GameFormat } from "@/lib/formations";
import { CUSTOM_PRESET_KEY, TIEBREAKER_PRESETS } from "@/lib/tiebreaker-presets";
import { TIEBREAKER_RULES, type TiebreakerRule } from "@/lib/tiebreaker-rules";

export type ChampionshipCreateScope = "TEAM" | "CLUB" | "ALL";

export interface ExistingChampionship {
  id: number;
  seasonId: number;
  name: string;
  startDate: string;
  endDate: string;
  pointsForWin: number;
  pointsForDraw: number;
  pointsForLoss: number;
  tiebreakerRules: TiebreakerRule[];
  tiebreakerPreset: string | null;
  numberOfPeriods: number;
  periodDurationMinutes: number;
  gameFormat: GameFormat;
}

interface SeasonOption {
  id: number;
  name: string;
}

interface ClubOption {
  id: number;
  name: string;
}

interface TeamOption {
  id: number;
  name: string;
}

const formSchema = z.object({
  seasonId: z.string().min(1),
  name: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  pointsForWin: z.string().min(1),
  pointsForDraw: z.string().min(1),
  pointsForLoss: z.string().min(1),
  numberOfPeriods: z.string().min(1),
  periodDurationMinutes: z.string().min(1),
  gameFormat: z.enum(GAME_FORMATS),
});

type FormValues = z.infer<typeof formSchema>;

function defaultValues(championship?: ExistingChampionship): FormValues {
  return {
    seasonId: championship ? String(championship.seasonId) : "",
    name: championship?.name ?? "",
    startDate: championship?.startDate.slice(0, 10) ?? "",
    endDate: championship?.endDate.slice(0, 10) ?? "",
    pointsForWin: String(championship?.pointsForWin ?? 3),
    pointsForDraw: String(championship?.pointsForDraw ?? 1),
    pointsForLoss: String(championship?.pointsForLoss ?? 0),
    numberOfPeriods: String(championship?.numberOfPeriods ?? 2),
    periodDurationMinutes: String(championship?.periodDurationMinutes ?? 45),
    gameFormat: championship?.gameFormat ?? "ELEVEN",
  };
}

function defaultPresetKey(championship?: ExistingChampionship): string {
  if (championship?.tiebreakerPreset) return championship.tiebreakerPreset;
  return TIEBREAKER_PRESETS[0].key;
}

function defaultRules(championship?: ExistingChampionship): TiebreakerRule[] {
  if (championship) return championship.tiebreakerRules;
  return TIEBREAKER_PRESETS[0].rules;
}

// Modale de création/édition d'un championnat (docs/schema/championnats.md
// — Championship), même convention que le reste de l'application. Les
// règles de départage (tiebreakerRules) sont gérées hors React Hook Form
// (état local ordonné) : un sélecteur de preset préremplit la liste,
// réordonnancement manuel par boutons Monter/Descendre (pas de lib drag &
// drop, aucune dans le repo — docs/roadmap.md Partie B §B6).
//
// `createScope` (B19, retour utilisateur) — uniquement pertinent en
// création, jamais en édition (l'équipe propriétaire d'un championnat
// existant ne se réassigne pas depuis ce formulaire) : pilote la variante
// du formulaire selon le rôle réel de l'appelant (jamais déduit d'un rôle
// côté client, toujours `createScope` renvoyé par le backend) —
// `undefined`/`"TEAM"` (Coach) : aucun sélecteur, l'équipe de la page
// courante (`teamId`) est utilisée telle quelle, comportement identique à
// avant B19. `"CLUB"` (AdminClub) : sélecteur d'équipe parmi celles du club
// courant. `"ALL"` (SuperAdmin/Proprietaire) : sélecteur de club (parmi ceux
// où l'appelant a une fiche Member — limite multi-club documentée,
// docs/modules/auth-roles.md §"Patterns découverts") puis d'équipe. Dans ces
// deux derniers cas, la création redirige vers la fiche du championnat créé
// plutôt que de rafraîchir la liste courante — le championnat peut
// appartenir à une équipe différente de celle affichée.
export function ChampionshipFormDialog({
  clubId,
  teamId,
  createScope,
  championship,
  trigger,
  onSuccess,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  clubId: string;
  teamId: string;
  createScope?: ChampionshipCreateScope | null;
  trigger?: ReactElement;
  championship?: ExistingChampionship;
  onSuccess: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const mode = championship ? "edit" : "create";
  const t = useTranslations("championshipForm");
  const tRules = useTranslations("tiebreakerRules");
  const tPresets = useTranslations("tiebreakerPresets");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChangeProp ?? setInternalOpen;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [seasons, setSeasons] = useState<SeasonOption[] | null>(null);
  const [presetKey, setPresetKey] = useState(defaultPresetKey(championship));
  const [rules, setRules] = useState<TiebreakerRule[]>(defaultRules(championship));

  const showClubSelector = mode === "create" && createScope === "ALL";
  const showTeamSelector =
    mode === "create" && (createScope === "ALL" || createScope === "CLUB");
  const [selectedClubId, setSelectedClubId] = useState(clubId);
  const [selectedTeamId, setSelectedTeamId] = useState(teamId);
  const [clubs, setClubs] = useState<ClubOption[] | null>(null);
  const [teams, setTeams] = useState<TeamOption[] | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(championship),
  });

  const loadSeasons = useCallback(
    async (forClubId: string) => {
      try {
        const response = await apiFetch(
          `/clubs/${forClubId}/seasons?teamId=${teamId}`,
          { headers: authHeaders(accessToken) },
        );
        if (!response.ok) throw new Error();
        const body = (await response.json()) as { data: SeasonOption[] };
        setSeasons(body.data);
      } catch {
        toast.error(t("seasonsLoadFailed"));
      }
    },
    [teamId, accessToken, t],
  );

  const loadClubs = useCallback(async () => {
    try {
      const response = await apiFetch("/clubs", { headers: authHeaders(accessToken) });
      if (!response.ok) throw new Error();
      setClubs((await response.json()) as ClubOption[]);
    } catch {
      toast.error(t("clubsLoadFailed"));
    }
  }, [accessToken, t]);

  const loadTeams = useCallback(
    async (forClubId: string) => {
      try {
        const response = await apiFetch(`/clubs/${forClubId}/teams`, {
          headers: authHeaders(accessToken),
        });
        if (!response.ok) throw new Error();
        setTeams((await response.json()) as TeamOption[]);
      } catch {
        toast.error(t("teamsLoadFailed"));
      }
    },
    [accessToken, t],
  );

  // Effet plutôt qu'un reset() dans handleOpenChange : en mode contrôlé
  // (colonne Actions de la liste), le parent ouvre la modale directement
  // (setOpen(true)) sans jamais déclencher onOpenChange du Dialog — même
  // raisonnement que PlayerFormDialog. Réagit à `open` (résolu, pas
  // `openProp`) pour couvrir aussi le mode self-managé.
  useEffect(() => {
    if (open) {
      reset(defaultValues(championship));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPresetKey(defaultPresetKey(championship));
      setRules(defaultRules(championship));
      setSelectedClubId(clubId);
      setSelectedTeamId(teamId);
      void loadSeasons(clubId);
      if (showClubSelector) void loadClubs();
      if (showTeamSelector) void loadTeams(clubId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, championship]);

  // Changer de club (scope ALL) : les équipes ET les saisons dépendent du
  // club sélectionné, l'équipe précédemment choisie n'a plus de sens.
  const handleClubChange = (value: string | null) => {
    if (!value) return;
    setSelectedClubId(value);
    setSelectedTeamId("");
    setTeams(null);
    void loadTeams(value);
    void loadSeasons(value);
  };

  const handlePresetChange = (nextKey: string | null) => {
    if (!nextKey) return;
    setPresetKey(nextKey);
    const preset = TIEBREAKER_PRESETS.find((p) => p.key === nextKey);
    if (preset) setRules(preset.rules);
  };

  const moveRule = (index: number, direction: -1 | 1) => {
    setRules((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setPresetKey(CUSTOM_PRESET_KEY);
  };

  const removeRule = (index: number) => {
    setRules((current) => current.filter((_, i) => i !== index));
    setPresetKey(CUSTOM_PRESET_KEY);
  };

  const addRule = (rule: TiebreakerRule) => {
    setRules((current) => [...current, rule]);
    setPresetKey(CUSTOM_PRESET_KEY);
  };

  const availableRules = TIEBREAKER_RULES.filter((rule) => !rules.includes(rule));

  const onSubmit = async (values: FormValues) => {
    if (rules.length === 0) {
      toast.error(t("tiebreakerRulesRequired"));
      return;
    }
    if (showClubSelector && !selectedClubId) {
      toast.error(t("clubRequired"));
      return;
    }
    if (showTeamSelector && !selectedTeamId) {
      toast.error(t("teamRequired"));
      return;
    }

    setIsSubmitting(true);
    const headers = authHeaders(accessToken);
    const body = JSON.stringify({
      seasonId: Number(values.seasonId),
      name: values.name,
      startDate: values.startDate,
      endDate: values.endDate,
      pointsForWin: Number(values.pointsForWin),
      pointsForDraw: Number(values.pointsForDraw),
      pointsForLoss: Number(values.pointsForLoss),
      tiebreakerRules: rules,
      tiebreakerPreset: presetKey === CUSTOM_PRESET_KEY ? undefined : presetKey,
      numberOfPeriods: Number(values.numberOfPeriods),
      periodDurationMinutes: Number(values.periodDurationMinutes),
      gameFormat: values.gameFormat,
    });
    try {
      const response =
        mode === "create"
          ? await apiFetch(
              `/clubs/${selectedClubId}/teams/${selectedTeamId}/championships`,
              { method: "POST", headers, body },
            )
          : await apiFetch(
              `/clubs/${clubId}/teams/${teamId}/championships/${championship!.id}`,
              { method: "PATCH", headers, body },
            );
      if (!response.ok) throw new Error(await parseErrorCode(response));

      toast.success(mode === "create" ? t("created") : t("updated"));
      setOpen(false);
      // Le championnat peut appartenir à une équipe différente de la page
      // courante (sélecteur club/équipe, B19) : rafraîchir la liste
      // affichée n'aurait pas de sens, on redirige vers sa propre fiche.
      if (mode === "create" && (createScope === "CLUB" || createScope === "ALL")) {
        const created = (await response.json()) as { id: number };
        router.push(
          `/clubs/${selectedClubId}/teams/${selectedTeamId}/championships/${created.id}`,
        );
      } else {
        onSuccess();
      }
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("createTitle") : t("editTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {(showClubSelector || showTeamSelector) && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {showClubSelector && (
                <div className="flex flex-col gap-2">
                  <Label>{t("club")}</Label>
                  <Select value={selectedClubId} onValueChange={handleClubChange}>
                    <SelectTrigger className="w-full" aria-label={t("club")}>
                      <SelectValue>
                        {(v: string | null) =>
                          clubs?.find((club) => String(club.id) === v)?.name ??
                          t("clubPlaceholder")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(clubs ?? []).map((club) => (
                        <SelectItem key={club.id} value={String(club.id)}>
                          {club.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {showTeamSelector && (
                <div className="flex flex-col gap-2">
                  <Label>{t("team")}</Label>
                  <Select
                    value={selectedTeamId}
                    onValueChange={(value) => value && setSelectedTeamId(value)}
                  >
                    <SelectTrigger className="w-full" aria-label={t("team")}>
                      <SelectValue>
                        {(v: string | null) =>
                          teams?.find((team) => String(team.id) === v)?.name ??
                          t("teamPlaceholder")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(teams ?? []).map((team) => (
                        <SelectItem key={team.id} value={String(team.id)}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="championship-name">{t("name")}</Label>
            <Input
              id="championship-name"
              placeholder={t("namePlaceholder")}
              {...register("name")}
            />
            {errors.name && <p className="text-sm text-destructive">{t("nameRequired")}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t("season")}</Label>
            <Controller
              control={control}
              name="seasonId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full" aria-label={t("season")}>
                    <SelectValue>
                      {(v: string | null) =>
                        seasons?.find((season) => String(season.id) === v)?.name ??
                        t("seasonPlaceholder")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(seasons ?? []).map((season) => (
                      <SelectItem key={season.id} value={String(season.id)}>
                        {season.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.seasonId && (
              <p className="text-sm text-destructive">{t("seasonRequired")}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="championship-startDate">{t("startDate")}</Label>
              <Input id="championship-startDate" type="date" {...register("startDate")} />
              {errors.startDate && (
                <p className="text-sm text-destructive">{t("dateRequired")}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="championship-endDate">{t("endDate")}</Label>
              <Input id="championship-endDate" type="date" {...register("endDate")} />
              {errors.endDate && <p className="text-sm text-destructive">{t("dateRequired")}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="championship-pointsForWin">{t("pointsForWin")}</Label>
              <Input
                id="championship-pointsForWin"
                type="number"
                min={0}
                {...register("pointsForWin")}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="championship-pointsForDraw">{t("pointsForDraw")}</Label>
              <Input
                id="championship-pointsForDraw"
                type="number"
                min={0}
                {...register("pointsForDraw")}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="championship-pointsForLoss">{t("pointsForLoss")}</Label>
              <Input
                id="championship-pointsForLoss"
                type="number"
                min={0}
                {...register("pointsForLoss")}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="championship-gameFormat">{t("gameFormat")}</Label>
            <Controller
              control={control}
              name="gameFormat"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="championship-gameFormat"
                    className="w-full"
                    aria-label={t("gameFormat")}
                  >
                    <SelectValue>
                      {(value: GameFormat) =>
                        `${GAME_FORMAT_PLAYER_COUNT[value]} vs ${GAME_FORMAT_PLAYER_COUNT[value]}`
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

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="championship-numberOfPeriods">{t("numberOfPeriods")}</Label>
              <Input
                id="championship-numberOfPeriods"
                type="number"
                min={1}
                {...register("numberOfPeriods")}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="championship-periodDurationMinutes">
                {t("periodDurationMinutes")}
              </Label>
              <Input
                id="championship-periodDurationMinutes"
                type="number"
                min={1}
                {...register("periodDurationMinutes")}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t("tiebreakerPreset")}</Label>
            <Select value={presetKey} onValueChange={handlePresetChange}>
              <SelectTrigger className="w-full" aria-label={t("tiebreakerPreset")}>
                <SelectValue>
                  {(v: string | null) =>
                    v === CUSTOM_PRESET_KEY || !v
                      ? tPresets("CUSTOM")
                      : tPresets(v)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TIEBREAKER_PRESETS.map((preset) => (
                  <SelectItem key={preset.key} value={preset.key}>
                    {tPresets(preset.key)}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_PRESET_KEY}>{tPresets("CUSTOM")}</SelectItem>
              </SelectContent>
            </Select>

            <ul className="flex flex-col gap-1.5" aria-label={t("tiebreakerRules")}>
              {rules.map((rule, index) => (
                <li
                  key={rule}
                  className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                >
                  <span>
                    {index + 1}. {tRules(rule)}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("moveUp")}
                      disabled={index === 0}
                      onClick={() => moveRule(index, -1)}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("moveDown")}
                      disabled={index === rules.length - 1}
                      onClick={() => moveRule(index, 1)}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("removeRule")}
                      onClick={() => removeRule(index)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {rules.length === 0 && (
              <p className="text-sm text-destructive">{t("tiebreakerRulesRequired")}</p>
            )}

            {availableRules.length > 0 && (
              <Select
                value=""
                onValueChange={(value) => value && addRule(value as TiebreakerRule)}
              >
                <SelectTrigger className="w-full" aria-label={t("addRule")}>
                  <SelectValue>{() => t("addRule")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {availableRules.map((rule) => (
                    <SelectItem key={rule} value={rule}>
                      {tRules(rule)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

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
