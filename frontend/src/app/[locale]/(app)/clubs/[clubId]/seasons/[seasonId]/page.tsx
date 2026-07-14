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
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, useRouter } from "@/i18n/navigation";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { seasonStatusBadgeVariant, type SeasonStatus } from "@/lib/season-status";
import { formatDate } from "@/lib/date-format";
import { SeasonFormDialog } from "@/components/seasons/season-form-dialog";

interface SeasonDetail {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: SeasonStatus;
}

// Composant nommé séparé du default export : voir la note dans
// teams/page.tsx (TeamsPageContent) — `use(params)` ne se résout pas de
// façon fiable sous Jest/jsdom. Saisons désormais club-wide (révision A14,
// docs/roadmap.md) : plus de teamId. Création/édition via `SeasonFormDialog`
// (modale), jamais un formulaire inline sur cette page — cohérence avec le
// reste de l'application (retour utilisateur explicite).
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
  const { accessToken } = useAuth();
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
      const response = await apiFetch(`/clubs/${clubId}/seasons/${seasonId}`, {
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
  }, [clubId, seasonId, accessToken, t]);

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
        const response = await apiFetch(
          `/clubs/${clubId}/seasons?status=ACTIVE`,
          { headers: authHeaders(accessToken) },
        );
        if (!response.ok) throw new Error();
        const data = (await response.json()) as SeasonDetail[];
        if (cancelled) return;
        const active = data[0] ?? null;
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
  }, [clubId, accessToken, season?.status]);

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
          {season.status === "DRAFT" && (
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
          {season.status === "DRAFT" && (
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
          <SeasonFormDialog
            clubId={clubId}
            season={season}
            onSuccess={loadSeason}
            trigger={<Button variant="outline">{t("edit")}</Button>}
          />
        </div>
      </div>

      {season.status === "ARCHIVED" && (
        <p className="text-sm text-muted-foreground">{t("archivedNotice")}</p>
      )}

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">{t("tabs.info")}</TabsTrigger>
          <TabsTrigger value="championships">{t("tabs.championships")}</TabsTrigger>
        </TabsList>
        <TabsContent value="info">
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("startDate")}</span>
                <span>{formatDate(season.startDate)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("endDate")}</span>
                <span>{formatDate(season.endDate)}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="championships">
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              {t("championshipsComingSoon")}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
