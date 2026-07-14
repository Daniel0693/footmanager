"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactElement } from "react";
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
import { FEET, type Foot } from "@/lib/foot";
import { GENDERS, type Gender } from "@/lib/gender";
import { POSITIONS, type Position } from "@/lib/positions";

const NONE = "NONE";
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MIN_LENGTH = 2;

// Résultat de GET /clubs/:clubId/players?search=... (A16, backend
// PlayersService.findAllByClub) — utilisé par le mode "Joueur existant du
// club" pour retrouver un joueur déjà présent ailleurs dans le club (ex.
// promotion U15→U16 entre saisons, révision A14-A18 — docs/roadmap.md).
export interface ExistingClubPlayerResult {
  id: number;
  member: { firstName: string; lastName: string };
  playerTeams: { team: { name: string } }[];
}

export interface ExistingPlayer {
  memberId: number;
  playerId: number;
  playerTeamId: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  gender: Gender | null;
  licenseNumber: string | null;
  nationality: string | null;
  birthDate: string | null;
  preferredFoot: Foot | null;
  jerseyNumber: number | null;
  mainPosition: Position | null;
  secondaryPositions: Position[];
  joinDate: string | null;
}

const formSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  gender: z.string().optional(),
  licenseNumber: z.string().optional(),
  nationality: z.string().optional(),
  birthDate: z.string().optional(),
  preferredFoot: z.string().optional(),
  jerseyNumber: z.string().optional(),
  mainPosition: z.string().optional(),
  secondaryPosition: z.string().optional(),
  joinDate: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function toIsoDateOrNull(value?: string): string | null {
  return value && value.trim() !== "" ? value : null;
}

function toTextOrNull(value?: string): string | null {
  return value && value.trim() !== "" ? value : null;
}

function toSelectOrNull<T extends string>(value?: string): T | null {
  return value && value !== NONE ? (value as T) : null;
}

function defaultValues(player?: ExistingPlayer): FormValues {
  return {
    firstName: player?.firstName ?? "",
    lastName: player?.lastName ?? "",
    phone: player?.phone ?? "",
    gender: player?.gender ?? NONE,
    licenseNumber: player?.licenseNumber ?? "",
    nationality: player?.nationality ?? "",
    // .slice(0, 10) : l'API renvoie une date ISO complète
    // ("2011-03-04T00:00:00.000Z"), mais <input type="date"> n'accepte que
    // "AAAA-MM-JJ" — sans ça, le navigateur rejette la valeur et affiche le
    // champ vide (bug signalé 2026-07-10 ; même correctif déjà appliqué
    // ailleurs dans le projet, voir absence-form-dialog.tsx/objective-form-dialog.tsx).
    birthDate: player?.birthDate?.slice(0, 10) ?? "",
    preferredFoot: player?.preferredFoot ?? NONE,
    jerseyNumber: player?.jerseyNumber !== null && player?.jerseyNumber !== undefined
      ? String(player.jerseyNumber)
      : "",
    mainPosition: player?.mainPosition ?? NONE,
    // Le formulaire ne gère qu'un seul poste secondaire (le premier du
    // tableau) : la sélection de plusieurs postes secondaires se fait via le
    // terrain interactif de la fiche joueur (décision du 2026-07-06).
    secondaryPosition: player?.secondaryPositions[0] ?? NONE,
    joinDate: player?.joinDate?.slice(0, 10) ?? "",
  };
}

export function PlayerFormDialog({
  clubId,
  teamId,
  trigger,
  player,
  onSuccess,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  clubId: string;
  teamId: string;
  trigger?: ReactElement;
  player?: ExistingPlayer;
  onSuccess: () => void;
  // Mode contrôlé (colonne Actions du tableau roster, B5.3) : "Éditer" doit
  // d'abord aller chercher les champs absents du RosterRow léger de la
  // liste (licenseNumber/nationality/preferredFoot/gender/joinDate) avant
  // d'ouvrir la modale — impossible avec le seul <DialogTrigger> déclenché
  // au clic. Sans ces deux props, le composant reste self-managé (trigger
  // visible + état interne), comportement inchangé pour les usages existants.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const mode = player ? "edit" : "create";
  const t = useTranslations("playerForm");
  const tGender = useTranslations("gender");
  const tFoot = useTranslations("foot");
  const tPositions = useTranslations("positions");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChangeProp ?? setInternalOpen;
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Mode "Joueur existant du club" (A18, révision A14-A18 — docs/roadmap.md) :
  // uniquement pertinent en création (mode === "create"), permet d'assigner à
  // cette équipe un joueur déjà présent ailleurs dans le club (ex. promotion
  // U15→U16 entre saisons) sans re-créer son Member/PlayerProfile. Par défaut
  // (retour utilisateur explicite) : la recherche est privilégiée sur la
  // création d'un nouveau joueur, la plupart des ajouts en cours de saison
  // étant des mouvements entre équipes du même club plutôt que de nouvelles
  // recrues.
  const [entryMode, setEntryMode] = useState<"new" | "existing">("existing");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ExistingClubPlayerResult[] | null>(null);
  const [selectedExistingPlayer, setSelectedExistingPlayer] =
    useState<ExistingClubPlayerResult | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(player),
  });

  // Effet plutôt qu'un reset() dans handleOpenChange : en mode contrôlé, le
  // parent fait souvent setPlayer(data) + setOpen(true) dans le même batch
  // (après un fetch), donc `onOpenChange` du Dialog ne se déclenche jamais
  // — seule la prop `open` change entre deux rendus. Un effet réagissant à
  // `open`/`player` couvre les deux modes.
  useEffect(() => {
    if (open) {
      reset(defaultValues(player));
      // Réinitialise le mode "Joueur existant" à chaque (ré)ouverture, même
      // raison que le reset() du formulaire juste au-dessus.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEntryMode("existing");
      setSearchQuery("");
      setSearchResults(null);
      setSelectedExistingPlayer(null);
    }
  }, [open, player, reset]);

  // Recherche club-wide débouncée (A16 côté backend) : ne se déclenche que
  // dans le mode "Joueur existant du club", tant qu'aucun candidat n'est
  // encore sélectionné et que la requête a un minimum de caractères.
  useEffect(() => {
    if (mode !== "create" || entryMode !== "existing" || selectedExistingPlayer) {
      return;
    }
    if (searchQuery.trim().length < SEARCH_MIN_LENGTH) {
      // Efface les résultats précédents sous le seuil de recherche — état
      // dérivé de searchQuery, pas d'appel réseau ici.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          const response = await apiFetch(
            `/clubs/${clubId}/players?search=${encodeURIComponent(searchQuery)}`,
            { headers: authHeaders(accessToken) },
          );
          if (!response.ok) throw new Error();
          const data = (await response.json()) as ExistingClubPlayerResult[];
          if (!cancelled) setSearchResults(data);
        } catch {
          if (!cancelled) setSearchResults([]);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [mode, entryMode, selectedExistingPlayer, searchQuery, clubId, accessToken]);

  const pickExistingPlayer = (candidate: ExistingClubPlayerResult) => {
    setSelectedExistingPlayer(candidate);
    setSearchResults(null);
    setSearchQuery("");
    // Satisfait la validation zod (firstName/lastName requis) sans afficher
    // ces champs — non envoyés à l'API dans ce mode, voir onSubmit : seule
    // l'affectation d'équipe (PlayerTeam) est créée, jamais un nouveau
    // Member/PlayerProfile.
    setValue("firstName", candidate.member.firstName);
    setValue("lastName", candidate.member.lastName);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    const headers = authHeaders(accessToken);
    try {
      const memberPayload = {
        firstName: values.firstName,
        lastName: values.lastName,
        phone: toTextOrNull(values.phone) ?? undefined,
        gender: toSelectOrNull<Gender>(values.gender) ?? undefined,
        // birthDate vit sur Member (docs/schema/fondations.md, 2026-07-08) —
        // pas sur PlayerProfile, commun à tous les rôles.
        birthDate: toIsoDateOrNull(values.birthDate) ?? undefined,
      };
      const profilePayload = {
        licenseNumber: toTextOrNull(values.licenseNumber) ?? undefined,
        nationality: toTextOrNull(values.nationality) ?? undefined,
        preferredFoot: toSelectOrNull<Foot>(values.preferredFoot) ?? undefined,
      };
      const jerseyNumber =
        values.jerseyNumber && values.jerseyNumber.trim() !== ""
          ? Number(values.jerseyNumber)
          : undefined;
      const secondaryPosition = toSelectOrNull<Position>(values.secondaryPosition);
      const teamPayload = {
        jerseyNumber,
        mainPosition: toSelectOrNull<Position>(values.mainPosition) ?? undefined,
        secondaryPositions: secondaryPosition ? [secondaryPosition] : [],
        joinDate: toIsoDateOrNull(values.joinDate) ?? undefined,
      };

      if (mode === "create" && entryMode === "existing") {
        // Joueur déjà existant dans le club (A18) : aucun Member/PlayerProfile
        // à créer, seule une nouvelle affectation PlayerTeam est nécessaire —
        // réutilise le même endpoint que le mode "Nouveau joueur" (déjà conçu
        // pour accepter un playerId existant, voir PlayerTeamsController.create).
        if (!selectedExistingPlayer) {
          toast.error(t("noPlayerSelected"));
          return;
        }
        const teamRes = await apiFetch(
          `/clubs/${clubId}/teams/${teamId}/players`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ playerId: selectedExistingPlayer.id, ...teamPayload }),
          },
        );
        if (!teamRes.ok) throw new Error(await parseErrorCode(teamRes));

        toast.success(t("created"));
      } else if (mode === "create") {
        // teamId en query sur les deux premiers appels : un Coach (rôles
        // scopés TEAM sur `member CREATE`/`player_profile CREATE`) ne serait
        // jamais autorisé sans lui, ces routes ne portant pas teamId dans
        // leur URL naturelle — voir docs/modules/auth-roles.md §"Patterns
        // découverts" (même bug que le mode édition ci-dessous).
        const memberRes = await apiFetch(
          `/clubs/${clubId}/members?teamId=${teamId}`,
          { method: "POST", headers, body: JSON.stringify(memberPayload) },
        );
        if (!memberRes.ok) throw new Error(await parseErrorCode(memberRes));
        const member = await memberRes.json();

        const profileRes = await apiFetch(
          `/clubs/${clubId}/players?teamId=${teamId}`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ memberId: member.id, ...profilePayload }),
          },
        );
        if (!profileRes.ok) throw new Error(await parseErrorCode(profileRes));
        const profile = await profileRes.json();

        const teamRes = await apiFetch(
          `/clubs/${clubId}/teams/${teamId}/players`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ playerId: profile.id, ...teamPayload }),
          },
        );
        if (!teamRes.ok) throw new Error(await parseErrorCode(teamRes));

        toast.success(t("created"));
      } else if (player) {
        // teamId en query : ces deux routes ne portent pas de teamId dans
        // leur URL naturelle, donc un Coach (rôles scopés TEAM sur
        // `member UPDATE`/`player_profile UPDATE`) ne serait jamais autorisé
        // sans lui — voir docs/modules/auth-roles.md §"Patterns découverts".
        const memberRes = await apiFetch(
          `/clubs/${clubId}/members/${player.memberId}?teamId=${teamId}`,
          { method: "PATCH", headers, body: JSON.stringify(memberPayload) },
        );
        if (!memberRes.ok) throw new Error(await parseErrorCode(memberRes));

        const profileRes = await apiFetch(
          `/clubs/${clubId}/players/${player.playerId}?teamId=${teamId}`,
          { method: "PATCH", headers, body: JSON.stringify(profilePayload) },
        );
        if (!profileRes.ok) throw new Error(await parseErrorCode(profileRes));

        const teamRes = await apiFetch(
          `/clubs/${clubId}/teams/${teamId}/players/${player.playerTeamId}`,
          { method: "PATCH", headers, body: JSON.stringify(teamPayload) },
        );
        if (!teamRes.ok) throw new Error(await parseErrorCode(teamRes));

        toast.success(t("updated"));
      }

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("createTitle") : t("editTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {mode === "create" && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant={entryMode === "existing" ? "default" : "outline"}
                onClick={() => setEntryMode("existing")}
              >
                {t("entryModeExisting")}
              </Button>
              <Button
                type="button"
                variant={entryMode === "new" ? "default" : "outline"}
                onClick={() => setEntryMode("new")}
              >
                {t("entryModeNew")}
              </Button>
            </div>
          )}

          {mode === "create" && entryMode === "existing" ? (
            selectedExistingPlayer ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-input p-3">
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium">
                    {selectedExistingPlayer.member.firstName}{" "}
                    {selectedExistingPlayer.member.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedExistingPlayer.playerTeams[0]
                      ? t("currentlyInTeam", {
                          team: selectedExistingPlayer.playerTeams[0].team.name,
                        })
                      : t("notInAnyTeam")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedExistingPlayer(null)}
                >
                  {t("changePlayer")}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="existingPlayerSearch">{t("searchLabel")}</Label>
                <Input
                  id="existingPlayerSearch"
                  placeholder={t("searchPlaceholder")}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                {searchResults && (
                  <ul className="flex max-h-48 flex-col overflow-y-auto rounded-lg border border-input">
                    {searchResults.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-muted-foreground">
                        {t("searchEmpty")}
                      </li>
                    ) : (
                      searchResults.map((candidate) => (
                        <li key={candidate.id}>
                          <button
                            type="button"
                            onClick={() => pickExistingPlayer(candidate)}
                            className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent"
                          >
                            <span className="font-medium">
                              {candidate.member.firstName} {candidate.member.lastName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {candidate.playerTeams[0]
                                ? t("currentlyInTeam", {
                                    team: candidate.playerTeams[0].team.name,
                                  })
                                : t("notInAnyTeam")}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            )
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="firstName">{t("firstName")}</Label>
                  <Input id="firstName" {...register("firstName")} />
                  {errors.firstName && (
                    <p className="text-sm text-destructive">{t("firstNameRequired")}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lastName">{t("lastName")}</Label>
                  <Input id="lastName" {...register("lastName")} />
                  {errors.lastName && (
                    <p className="text-sm text-destructive">{t("lastNameRequired")}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="phone">{t("phone")}</Label>
                  <Input id="phone" {...register("phone")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("gender")}</Label>
                  <Controller
                    control={control}
                    name="gender"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full">
                          <SelectValue>
                            {(value: string | null) =>
                              value && value !== NONE ? tGender(value) : t("genderUnspecified")
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>{t("genderUnspecified")}</SelectItem>
                          {GENDERS.map((gender) => (
                            <SelectItem key={gender} value={gender}>
                              {tGender(gender)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="licenseNumber">{t("licenseNumber")}</Label>
                  <Input id="licenseNumber" {...register("licenseNumber")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="nationality">{t("nationality")}</Label>
                  <Input id="nationality" {...register("nationality")} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="birthDate">{t("birthDate")}</Label>
                  <Input id="birthDate" type="date" {...register("birthDate")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("preferredFoot")}</Label>
                  <Controller
                    control={control}
                    name="preferredFoot"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full">
                          <SelectValue>
                            {(value: string | null) =>
                              value && value !== NONE ? tFoot(value) : t("footUnspecified")
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>{t("footUnspecified")}</SelectItem>
                          {FEET.map((foot) => (
                            <SelectItem key={foot} value={foot}>
                              {tFoot(foot)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="jerseyNumber">{t("jerseyNumber")}</Label>
              <Input id="jerseyNumber" type="number" min={0} {...register("jerseyNumber")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="joinDate">{t("joinDate")}</Label>
              <Input id="joinDate" type="date" {...register("joinDate")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("mainPosition")}</Label>
              <Controller
                control={control}
                name="mainPosition"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
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
                )}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("secondaryPosition")}</Label>
              <Controller
                control={control}
                name="secondaryPosition"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
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
                )}
              />
            </div>
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
