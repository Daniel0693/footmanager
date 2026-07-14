"use client";

import { useTranslations } from "next-intl";
import { use, useCallback, useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { seasonStatusBadgeVariant, type SeasonStatus } from "@/lib/season-status";
import { formatDate } from "@/lib/date-format";
import { resolveAnyTeamId } from "@/lib/resolve-any-team";
import { SeasonFormDialog } from "@/components/seasons/season-form-dialog";
import { SeasonChampionshipsPanel } from "@/components/seasons/season-championships-panel";

interface SeasonDetail {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: SeasonStatus;
  canManage: boolean;
}

// Composant nommé séparé du default export : voir la note dans
// teams/page.tsx (TeamsPageContent) — `use(params)` ne se résout pas de
// façon fiable sous Jest/jsdom. Saisons désormais club-wide (révision A14,
// docs/roadmap.md) : plus de teamId dans l'URL, mais un Coach/Player en
// lecture seule (scope TEAM) doit transmettre `?teamId=` pour être autorisé
// par PermissionsGuard — résolu via `resolveAnyTeamId` (voir seasons/page.tsx
// pour le détail du raisonnement). `season.canManage` (renvoyé par le
// backend) pilote l'affichage des boutons Activer/Supprimer/Modifier :
// jamais déduit d'un rôle côté client. Création/édition via
// `SeasonFormDialog` (modale), jamais un formulaire inline sur cette page —
// cohérence avec le reste de l'application (retour utilisateur explicite).
// Refonte B16 (retour utilisateur explicite) : plus d'onglets — l'onglet
// "Informations" ne contenait que 2 dates, pas assez pour justifier un
// onglet dédié. Layout à deux colonnes : dates en petite colonne (1/4),
// championnats de la saison (toutes équipes du club, surtout utile à
// l'AdminClub) en colonne large (3/4) via `SeasonChampionshipsPanel`.
export function SeasonDetailPageContent({
  clubId,
  seasonId,
}: {
  clubId: string;
  seasonId: string;
}) {
  const t = useTranslations("seasonDetail");
  const tStatus = useTranslations("seasons.status");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const [season, setSeason] = useState<SeasonDetail | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // Saison ACTIVE actuelle du club (s'il y en a une), chargée seulement pour
  // une saison DRAFT : pré-remplit la confirmation d'activation (l'ancienne
  // sera archivée, sa endDate reste corrigeable). Plus de résumé
  // reconduits/partants/arrivants — pas de logique de roster sur l'activation
  // depuis la révision A14 (docs/roadmap.md).
  const [currentActiveSeason, setCurrentActiveSeason] = useState<SeasonDetail | null>(null);
  const [oldSeasonEndDate, setOldSeasonEndDate] = useState("");
  const [isActivating, setIsActivating] = useState(false);

  const loadSeason = useCallback(async () => {
    try {
      const teamId = user ? await resolveAnyTeamId(clubId, user.id, accessToken) : null;
      const query = teamId ? `?teamId=${teamId}` : "";
      const response = await apiFetch(`/clubs/${clubId}/seasons/${seasonId}${query}`, {
        headers: authHeaders(accessToken),
      });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as SeasonDetail;
      setSeason(data);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [clubId, seasonId, accessToken, user, t]);

  useEffect(() => {
    // Bootstrap volontaire : charge la saison au montage — cas d'usage
    // légitime d'un effect (pas un état dérivable du rendu).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSeason();
  }, [loadSeason]);

  useEffect(() => {
    if (season?.status !== "DRAFT") return;
    let cancelled = false;
    (async () => {
      try {
        const teamId = user ? await resolveAnyTeamId(clubId, user.id, accessToken) : null;
        const teamQuery = teamId ? `&teamId=${teamId}` : "";
        const response = await apiFetch(
          `/clubs/${clubId}/seasons?status=ACTIVE${teamQuery}`,
          { headers: authHeaders(accessToken) },
        );
        if (!response.ok) throw new Error();
        const data = (await response.json()) as { data: SeasonDetail[] };
        if (cancelled) return;
        const active = data.data[0] ?? null;
        setCurrentActiveSeason(active);
        setOldSeasonEndDate(active?.endDate.slice(0, 10) ?? "");
      } catch {
        // Silencieux : l'activation reste possible sans pré-remplissage,
        // l'échec de ce chargement annexe n'empêche pas l'action principale.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clubId, accessToken, user, season?.status]);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await apiFetch(`/clubs/${clubId}/seasons/${seasonId}`, {
        method: "DELETE",
        headers: authHeaders(accessToken),
      });
      if (!response.ok) throw new Error(await parseErrorCode(response));
      toast.success(t("deleted"));
      router.push(`/clubs/${clubId}/seasons`);
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(code ? tErrors(code) : t("deleteFailed"));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleActivate = async () => {
    setIsActivating(true);
    try {
      const body =
        currentActiveSeason && oldSeasonEndDate ? { oldSeasonEndDate } : {};
      const response = await apiFetch(
        `/clubs/${clubId}/seasons/${seasonId}/activate`,
        {
          method: "POST",
          headers: authHeaders(accessToken),
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) throw new Error(await parseErrorCode(response));
      toast.success(t("activated"));
      await loadSeason();
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(code ? tErrors(code) : t("activateFailed"));
    } finally {
      setIsActivating(false);
    }
  };

  if (hasError) {
    return (
      <div className="flex w-full flex-col gap-4 p-4">
        <Link
          href={`/clubs/${clubId}/seasons`}
          className="text-sm text-muted-foreground underline"
        >
          {t("backToSeasons")}
        </Link>
        <p className="text-sm text-destructive">{t("loadFailed")}</p>
      </div>
    );
  }

  if (!season) {
    return null;
  }

  return (
    <div className="flex w-full flex-col gap-4 p-4">
      <Link
        href={`/clubs/${clubId}/seasons`}
        className="text-sm text-muted-foreground underline"
      >
        {t("backToSeasons")}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{season.name}</h1>
          <Badge variant={seasonStatusBadgeVariant(season.status)}>
            {tStatus(season.status)}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {season.canManage && season.status === "DRAFT" && (
            <AlertDialog>
              <AlertDialogTrigger render={<Button type="button">{t("activate")}</Button>} />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("activateDialogTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {currentActiveSeason
                      ? t("activateDialogDescriptionWithOldSeason", {
                          name: currentActiveSeason.name,
                        })
                      : t("activateDialogDescriptionFirstSeason")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {currentActiveSeason && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="oldSeasonEndDate">{t("oldSeasonEndDate")}</Label>
                    <Input
                      id="oldSeasonEndDate"
                      type="date"
                      value={oldSeasonEndDate}
                      onChange={(event) => setOldSeasonEndDate(event.target.value)}
                    />
                  </div>
                )}
                <AlertDialogFooter>
                  <AlertDialogClose render={<Button variant="outline">{t("cancel")}</Button>} />
                  <AlertDialogClose
                    render={
                      <Button onClick={handleActivate} disabled={isActivating}>
                        {t("activateConfirm")}
                      </Button>
                    }
                  />
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {season.canManage && season.status === "DRAFT" && (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button type="button" variant="destructive">
                    {t("delete")}
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("deleteDialogDescription")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogClose render={<Button variant="outline">{t("cancel")}</Button>} />
                  <AlertDialogClose
                    render={
                      <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                        {t("deleteConfirm")}
                      </Button>
                    }
                  />
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {season.canManage && (
            <SeasonFormDialog
              clubId={clubId}
              season={season}
              onSuccess={loadSeason}
              trigger={<Button variant="outline">{t("edit")}</Button>}
            />
          )}
        </div>
      </div>

      {season.status === "ARCHIVED" && (
        <p className="text-sm text-muted-foreground">{t("archivedNotice")}</p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4 lg:gap-10">
        <div className="flex flex-col gap-3 text-sm lg:col-span-1">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">{t("startDate")}</span>
            <span>{formatDate(season.startDate)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">{t("endDate")}</span>
            <span>{formatDate(season.endDate)}</span>
          </div>
        </div>
        <div className="lg:col-span-3">
          <SeasonChampionshipsPanel clubId={clubId} seasonId={seasonId} />
        </div>
      </div>
    </div>
  );
}

export default function SeasonDetailPage({
  params,
}: {
  params: Promise<{ clubId: string; seasonId: string }>;
}) {
  const { clubId, seasonId } = use(params);
  return <SeasonDetailPageContent clubId={clubId} seasonId={seasonId} />;
}
