"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactElement } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
const MATCH_DEBOUNCE_MS = 400;

// Résultat de GET /clubs/:clubId/players?search=... (A16, backend
// PlayersService.findAllByClub) — alimente le repli "Rechercher un joueur
// existant" (recherche manuelle par nom, voir plus bas).
export interface ExistingClubPlayerResult {
  id: number;
  member: { firstName: string; lastName: string };
  playerTeams: { team: { name: string } }[];
}

// Résultat de GET .../roster/lookup (rapprochement joueur, backend
// RosterMatchingService — docs/decisions-ouvertes-et-rgpd.md, décisions du
// 2026-07-16). L'email n'entre jamais dans ce rapprochement (réservé au
// futur mécanisme inter-club, décision ouverte #7).
export interface PlayerMatchAssignment {
  jerseyNumber: number | null;
  mainPosition: Position | null;
  secondaryPositions: Position[];
}

export interface PlayerMatchCandidate {
  playerId: number;
  firstName: string;
  lastName: string;
  activeAssignmentInTeam: PlayerMatchAssignment | null;
  // Affectation la plus récente, toutes équipes du club confondues — sert de
  // point de départ modifiable pour le maillot/poste, même quand elle vient
  // d'une autre équipe que celle ciblée (retour utilisateur du 2026-07-16).
  lastAssignment: PlayerMatchAssignment | null;
  activeTeamsElsewhere: { teamId: number; teamName: string }[];
}

export interface PlayerMatchResult {
  status: "NEW" | "MODIFICATION" | "REACTIVATION" | "AMBIGUOUS";
  candidates: PlayerMatchCandidate[];
}

// Forme unifiée d'un candidat confirmé (réactivation automatique, choix
// parmi une liste ambiguë, ou recherche manuelle) — un seul état pilote
// l'affichage de la carte de confirmation et la soumission, quelle que soit
// la façon dont le candidat a été trouvé.
interface ConfirmedCandidate {
  playerId: number;
  firstName: string;
  lastName: string;
  currentTeamName: string | null;
  prefill: PlayerMatchAssignment | null;
}

function fromMatchCandidate(candidate: PlayerMatchCandidate): ConfirmedCandidate {
  return {
    playerId: candidate.playerId,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    currentTeamName: candidate.activeTeamsElsewhere[0]?.teamName ?? null,
    prefill: candidate.lastAssignment,
  };
}

function fromSearchResult(result: ExistingClubPlayerResult): ConfirmedCandidate {
  return {
    playerId: result.id,
    firstName: result.member.firstName,
    lastName: result.member.lastName,
    currentTeamName: result.playerTeams[0]?.team.name ?? null,
    prefill: null,
  };
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

// Date locale (pas .toISOString(), qui bascule sur UTC et peut renvoyer le
// jour suivant/précédent selon le fuseau et l'heure).
function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
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
    // Par défaut "aujourd'hui" en création (retour utilisateur du
    // 2026-07-16) — toujours modifiable si la saisie anticipe ou retarde sur
    // la date d'arrivée réelle. En édition, ne jamais réécrire une valeur
    // déjà existante (y compris vide) avec la date du jour.
    joinDate: player ? (player.joinDate?.slice(0, 10) ?? "") : todayIsoDate(),
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

  // Rapprochement automatique (création uniquement — docs/decisions-ouvertes-
  // et-rgpd.md, décisions du 2026-07-16) : dès que prénom+nom sont renseignés,
  // interroge GET .../roster/lookup pour détecter Nouveau/Modification/
  // Réactivation/Ambigu, sans jamais passer par l'email (réservé au futur
  // mécanisme inter-club, décision ouverte #7).
  const [matchResult, setMatchResult] = useState<PlayerMatchResult | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  // Passe à `true` dès qu'une recherche a été tentée au moins une fois
  // (retour utilisateur du 2026-07-16 : prénom+nom seuls ne suffisent pas à
  // eux seuls, il faut aussi une date de naissance ou une licence — sans ça,
  // le backend renvoie NOUVEAU sans avoir vraiment cherché, ce qui était
  // trompeur). Ne redevient jamais `false` ensuite (pas de re-masquage du
  // reste du formulaire une fois révélé, pour éviter un effet de clignotement
  // pendant la correction d'une faute de frappe).
  const [hasSearched, setHasSearched] = useState(false);
  // L'utilisateur a explicitement refusé la correspondance proposée (ou
  // aucun candidat ambigu ne convenait) : force le formulaire "nouveau
  // joueur" tant que l'identité n'est pas modifiée à nouveau.
  const [declinedMatch, setDeclinedMatch] = useState(false);
  // Recherche manuelle de secours ("Rechercher à nouveau", retour
  // utilisateur) : rouvre l'ancienne recherche libre par nom (A18) quand la
  // détection automatique ne trouve rien ou se trompe (homonyme mal
  // orthographié, etc.).
  const [manualSearchOpen, setManualSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ExistingClubPlayerResult[] | null>(null);
  const [confirmedCandidate, setConfirmedCandidate] = useState<ConfirmedCandidate | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(player),
  });

  const [watchedFirstName, watchedLastName, watchedBirthDate, watchedLicenseNumber] = useWatch({
    control,
    name: ["firstName", "lastName", "birthDate", "licenseNumber"],
  });

  // Effet plutôt qu'un reset() dans handleOpenChange : en mode contrôlé, le
  // parent fait souvent setPlayer(data) + setOpen(true) dans le même batch
  // (après un fetch), donc `onOpenChange` du Dialog ne se déclenche jamais
  // — seule la prop `open` change entre deux rendus. Un effet réagissant à
  // `open`/`player` couvre les deux modes.
  useEffect(() => {
    if (open) {
      reset(defaultValues(player));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMatchResult(null);
      setMatchLoading(false);
      setHasSearched(false);
      setDeclinedMatch(false);
      setManualSearchOpen(false);
      setSearchQuery("");
      setSearchResults(null);
      setConfirmedCandidate(null);
    }
  }, [open, player, reset]);

  // Rapprochement automatique débouncé : ne se déclenche qu'en création,
  // tant qu'aucun candidat n'est confirmé et que la recherche manuelle n'est
  // pas ouverte. Réinitialise systématiquement `declinedMatch` : changer
  // l'identité doit toujours redonner sa chance à la détection automatique.
  useEffect(() => {
    if (mode !== "create" || confirmedCandidate || manualSearchOpen) {
      return;
    }
    const firstName = watchedFirstName?.trim() ?? "";
    const lastName = watchedLastName?.trim() ?? "";
    const birthDate = watchedBirthDate?.trim() ?? "";
    const licenseNumber = watchedLicenseNumber?.trim() ?? "";
    // Prénom+nom seuls ne suffisent pas : il faut aussi une date de
    // naissance ou une licence, sinon le backend n'a rien de fiable à
    // chercher (voir docs/schema/joueurs.md — le repli nom seul est exclu).
    if (!firstName || !lastName || (!birthDate && !licenseNumber)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMatchResult(null);
      return;
    }
    let cancelled = false;
    setDeclinedMatch(false);
    setMatchLoading(true);
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ firstName, lastName });
          if (birthDate) params.set("birthDate", birthDate);
          if (licenseNumber) params.set("licenseNumber", licenseNumber);
          const response = await apiFetch(
            `/clubs/${clubId}/teams/${teamId}/roster/lookup?${params.toString()}`,
            { headers: authHeaders(accessToken) },
          );
          if (!response.ok) throw new Error();
          const data = (await response.json()) as PlayerMatchResult;
          if (!cancelled) setMatchResult(data);
        } catch {
          if (!cancelled) setMatchResult(null);
        } finally {
          // Révèle le reste du formulaire une fois la recherche terminée
          // (succès ou échec) — retour utilisateur du 2026-07-16 : la
          // recherche doit se terminer avant d'afficher la suite, pas en
          // parallèle.
          if (!cancelled) {
            setMatchLoading(false);
            setHasSearched(true);
          }
        }
      })();
    }, MATCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [
    mode,
    confirmedCandidate,
    manualSearchOpen,
    watchedFirstName,
    watchedLastName,
    watchedBirthDate,
    watchedLicenseNumber,
    clubId,
    teamId,
    accessToken,
  ]);

  // Recherche manuelle débouncée (repli "Rechercher à nouveau") : même
  // endpoint club-wide que l'ancien mode "Joueur existant du club" (A16).
  useEffect(() => {
    if (mode !== "create" || !manualSearchOpen || confirmedCandidate) {
      return;
    }
    if (searchQuery.trim().length < SEARCH_MIN_LENGTH) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          // teamId en query : GET /clubs/:clubId/players ne porte aucun
          // teamId dans son URL naturelle, donc un Coach (player_profile
          // READ scopé TEAM) reçoit systématiquement un 403 sans lui — bug
          // réel trouvé le 2026-07-16 (silencieusement confondu avec "aucun
          // résultat" avant ce correctif, voir catch ci-dessous). Ne
          // restreint jamais les résultats eux-mêmes à cette équipe (le
          // service ne filtre par teamId pour aucun scope TEAM/CLUB/ALL) —
          // sert uniquement à résoudre le scope du guard, voir
          // docs/modules/auth-roles.md §"Patterns découverts".
          const response = await apiFetch(
            `/clubs/${clubId}/players?search=${encodeURIComponent(searchQuery)}&teamId=${teamId}`,
            { headers: authHeaders(accessToken) },
          );
          if (!response.ok) throw new Error(await parseErrorCode(response));
          const data = (await response.json()) as ExistingClubPlayerResult[];
          if (!cancelled) setSearchResults(data);
        } catch (error) {
          // Distingue une vraie erreur (réseau, permission...) d'un résultat
          // vide — les confondre a déjà masqué un bug réel de permission
          // (2026-07-16), affiché jusque-là comme "Aucun joueur trouvé".
          if (!cancelled) {
            setSearchResults(null);
            const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
            toast.error(tErrors(code));
          }
        }
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [mode, manualSearchOpen, confirmedCandidate, searchQuery, clubId, teamId, accessToken, tErrors]);

  const confirmCandidate = (candidate: ConfirmedCandidate) => {
    setConfirmedCandidate(candidate);
    setManualSearchOpen(false);
    setMatchResult(null);
    setSearchResults(null);
    setSearchQuery("");
    // Satisfait la validation zod (firstName/lastName requis) sans afficher
    // ces champs — non envoyés à l'API dans ce mode, voir onSubmit : seule
    // l'affectation d'équipe (PlayerTeam) est créée, jamais un nouveau
    // Member/PlayerProfile.
    setValue("firstName", candidate.firstName);
    setValue("lastName", candidate.lastName);
    // Réactivation (docs/decisions-ouvertes-et-rgpd.md) : préremplit
    // maillot/poste depuis la dernière affectation connue de ce candidat,
    // même si elle vient d'une autre équipe du club — un point de départ
    // modifiable vaut mieux qu'un champ vide (retour utilisateur du
    // 2026-07-16). `null` uniquement si ce candidat n'a jamais eu
    // d'affectation. Modifiable avant validation finale.
    if (candidate.prefill) {
      setValue(
        "jerseyNumber",
        candidate.prefill.jerseyNumber !== null ? String(candidate.prefill.jerseyNumber) : "",
      );
      setValue("mainPosition", candidate.prefill.mainPosition ?? NONE);
      setValue("secondaryPosition", candidate.prefill.secondaryPositions[0] ?? NONE);
    }
  };

  const matchPanel: "ambiguous" | "reactivation" | "modification" | "noMatch" | "identity" =
    mode === "create" && !confirmedCandidate && !manualSearchOpen && !declinedMatch && matchResult
      ? matchResult.status === "AMBIGUOUS"
        ? "ambiguous"
        : matchResult.status === "REACTIVATION"
          ? "reactivation"
          : matchResult.status === "MODIFICATION"
            ? "modification"
            : "noMatch"
      : "identity";

  // "Chercher à nouveau" (carte "Aucune correspondance trouvée") : vide les
  // champs d'identité et attend une nouvelle recherche, plutôt que de
  // rouvrir l'ancienne recherche libre par nom — retour utilisateur du
  // 2026-07-16.
  const retrySearch = () => {
    setValue("firstName", "");
    setValue("lastName", "");
    setValue("birthDate", "");
    setValue("licenseNumber", "");
    setMatchResult(null);
    setHasSearched(false);
    setDeclinedMatch(false);
  };

  // Le reste du formulaire (identité complète + affectation d'équipe) reste
  // masqué tant qu'une correspondance est en attente de décision (réactiver
  // / créer un nouveau / choisir parmi une liste ambiguë) — retour
  // utilisateur du 2026-07-16 : seul un candidat confirmé, ou une recherche
  // résolue sans rien à décider (statut NOUVEAU, ou décision déjà refusée),
  // révèle la suite.
  const showRestOfForm =
    mode !== "create" || confirmedCandidate !== null || (hasSearched && matchPanel === "identity");

  // Le blocage de soumission ne s'applique qu'une fois prénom+nom renseignés
  // — un formulaire encore vide doit rester soumissible pour que la
  // validation zod (prénom/nom requis) puisse s'afficher normalement.
  const identityProvided = Boolean(watchedFirstName?.trim() && watchedLastName?.trim());
  const submitBlocked =
    mode === "create" &&
    !confirmedCandidate &&
    identityProvided &&
    (!hasSearched ||
      matchLoading ||
      matchPanel === "ambiguous" ||
      matchPanel === "reactivation" ||
      matchPanel === "modification" ||
      matchPanel === "noMatch");

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

      if (mode === "create" && confirmedCandidate) {
        // Joueur déjà existant (rapprochement automatique ou recherche
        // manuelle) : aucun Member/PlayerProfile à créer, seule une nouvelle
        // affectation PlayerTeam est nécessaire — réutilise le même endpoint
        // que le mode "Nouveau joueur" (déjà conçu pour accepter un playerId
        // existant, voir PlayerTeamsController.create).
        const teamRes = await apiFetch(
          `/clubs/${clubId}/teams/${teamId}/players`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ playerId: confirmedCandidate.playerId, ...teamPayload }),
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
      // En plus du toast (peu visible, retour utilisateur du 2026-07-16) :
      // encadre le champ concerné en rouge avec un message dédié, pour les
      // codes d'erreur qu'on peut rattacher à un champ précis.
      if (code === "PLAYER_TEAMS.JERSEY_NUMBER_TAKEN") {
        setError("jerseyNumber", { type: "manual", message: t("jerseyNumberTakenError") });
      }
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
          {mode === "create" && confirmedCandidate ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-input p-3">
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium">
                  {confirmedCandidate.firstName} {confirmedCandidate.lastName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {confirmedCandidate.currentTeamName
                    ? t("currentlyInTeam", { team: confirmedCandidate.currentTeamName })
                    : t("notInAnyTeam")}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmedCandidate(null)}
              >
                {t("changePlayer")}
              </Button>
            </div>
          ) : mode === "create" && manualSearchOpen ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="existingPlayerSearch">{t("searchLabel")}</Label>
                <button
                  type="button"
                  onClick={() => setManualSearchOpen(false)}
                  className="text-xs text-muted-foreground underline"
                >
                  {t("closeManualSearch")}
                </button>
              </div>
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
                          onClick={() => confirmCandidate(fromSearchResult(candidate))}
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
                  <Label htmlFor="birthDate">{t("birthDate")}</Label>
                  <Input id="birthDate" type="date" {...register("birthDate")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="licenseNumber">{t("licenseNumber")}</Label>
                  <Input id="licenseNumber" {...register("licenseNumber")} />
                </div>
              </div>

              {/* Explique le mécanisme invisible sinon (retour utilisateur du
                  2026-07-16) : rien ne signalait qu'au-delà de prénom+nom, la
                  date de naissance/licence déclenche une vérification
                  automatique — seul le bouton de recherche manuelle était
                  visible, laissant croire que c'était la seule option.
                  Disparaît dès qu'une recherche a été tentée (le panneau de
                  résultat prend le relais). */}
              {mode === "create" && matchPanel === "identity" && !hasSearched && !matchLoading && (
                <p className="text-xs text-muted-foreground">{t("matchHint")}</p>
              )}

              {mode === "create" && matchLoading && (
                <p className="text-sm text-muted-foreground">{t("matchChecking")}</p>
              )}

              {mode === "create" && !matchLoading && matchPanel === "ambiguous" && matchResult && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted-foreground">{t("matchAmbiguousNotice")}</p>
                  <ul className="flex max-h-48 flex-col overflow-y-auto rounded-lg border border-input">
                    {matchResult.candidates.map((candidate) => (
                      <li key={candidate.playerId}>
                        <button
                          type="button"
                          onClick={() => confirmCandidate(fromMatchCandidate(candidate))}
                          className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          <span className="font-medium">
                            {candidate.firstName} {candidate.lastName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {candidate.activeTeamsElsewhere[0]
                              ? t("currentlyInTeam", {
                                  team: candidate.activeTeamsElsewhere[0].teamName,
                                })
                              : t("notInAnyTeam")}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="self-start"
                    onClick={() => setDeclinedMatch(true)}
                  >
                    {t("matchAmbiguousNone")}
                  </Button>
                </div>
              )}

              {mode === "create" && !matchLoading && matchPanel === "reactivation" && matchResult && (
                <div className="flex flex-col gap-2 rounded-lg border border-input p-3">
                  <p className="text-sm">
                    {t("matchReactivationNotice")}{" "}
                    <span className="font-medium">
                      {matchResult.candidates[0].firstName} {matchResult.candidates[0].lastName}
                    </span>{" "}
                    —{" "}
                    {matchResult.candidates[0].activeTeamsElsewhere[0]
                      ? t("currentlyInTeam", {
                          team: matchResult.candidates[0].activeTeamsElsewhere[0].teamName,
                        })
                      : t("notInAnyTeam")}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => confirmCandidate(fromMatchCandidate(matchResult.candidates[0]))}
                    >
                      {t("matchReactivationAccept")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDeclinedMatch(true)}
                    >
                      {t("matchReactivationDecline")}
                    </Button>
                  </div>
                </div>
              )}

              {mode === "create" && !matchLoading && matchPanel === "modification" && (
                <p className="text-sm text-destructive">{t("matchModificationNotice")}</p>
              )}

              {mode === "create" && !matchLoading && matchPanel === "noMatch" && (
                <div className="flex flex-col gap-2 rounded-lg border border-input p-3">
                  <p className="text-sm">
                    {t("matchNoneNotice", {
                      firstName: watchedFirstName ?? "",
                      lastName: watchedLastName ?? "",
                    })}
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={retrySearch}>
                      {t("matchNoneRetry")}
                    </Button>
                    <Button type="button" size="sm" onClick={() => setDeclinedMatch(true)}>
                      {t("matchNoneCreateNew")}
                    </Button>
                  </div>
                </div>
              )}

              {mode === "create" && !matchLoading && matchPanel === "identity" && identityProvided && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setManualSearchOpen(true)}
                  className="self-start"
                >
                  {t("openManualSearch")}
                </Button>
              )}

              {showRestOfForm && (
                <>
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
                      <Label htmlFor="nationality">{t("nationality")}</Label>
                      <Input id="nationality" {...register("nationality")} />
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
            </>
          )}

          {showRestOfForm && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="jerseyNumber">{t("jerseyNumber")}</Label>
                  <Input
                    id="jerseyNumber"
                    type="number"
                    min={0}
                    aria-invalid={!!errors.jerseyNumber}
                    {...register("jerseyNumber")}
                  />
                  {errors.jerseyNumber && (
                    <p className="text-sm text-destructive">{errors.jerseyNumber.message}</p>
                  )}
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
            </>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || submitBlocked}>
              {mode === "create" ? t("submitCreate") : t("submitEdit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
