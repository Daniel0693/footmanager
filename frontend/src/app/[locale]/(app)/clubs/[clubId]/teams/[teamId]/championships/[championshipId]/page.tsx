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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, useRouter } from "@/i18n/navigation";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/date-format";
import {
  ChampionshipFormDialog,
  type ExistingChampionship,
} from "@/components/championships/championship-form-dialog";
import { ParticipantsTab } from "@/components/championships/participants-tab";
import { MatchesTab } from "@/components/championships/matches-tab";

interface ChampionshipDetail extends ExistingChampionship {
  season: { id: number; name: string };
  canManage: boolean;
}

// Composant nommé séparé du default export : voir la note dans
// teams/page.tsx (TeamsPageContent) — `use(params)` ne se résout pas de
// façon fiable sous Jest/jsdom. Fiche d'un championnat (Partie B) :
// Participants (B9) et Calendrier (B13) pleinement fonctionnels, Classement
// en placeholder jusqu'à B14. Édition/suppression via ChampionshipFormDialog
// et une confirmation dédiée, jamais un formulaire inline — cohérence avec
// le reste de l'application (fiche de saison, notamment).
export function ChampionshipDetailPageContent({
  clubId,
  teamId,
  championshipId,
}: {
  clubId: string;
  teamId: string;
  championshipId: string;
}) {
  const t = useTranslations("championshipDetail");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const { accessToken } = useAuth();
  const [championship, setChampionship] = useState<ChampionshipDetail | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadChampionship = useCallback(async () => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/championships/${championshipId}`,
        { headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error();
      const data = (await response.json()) as ChampionshipDetail;
      setChampionship(data);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [clubId, teamId, championshipId, accessToken, t]);

  useEffect(() => {
    // Bootstrap volontaire : charge le championnat au montage — cas d'usage
    // légitime d'un effect (pas un état dérivable du rendu).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadChampionship();
  }, [loadChampionship]);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/championships/${championshipId}`,
        { method: "DELETE", headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error(await parseErrorCode(response));
      toast.success(t("deleted"));
      router.push(`/clubs/${clubId}/teams/${teamId}/championships`);
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(code ? tErrors(code) : t("deleteFailed"));
    } finally {
      setIsDeleting(false);
    }
  };

  if (hasError) {
    return (
      <div className="flex w-full flex-col gap-4 p-4">
        <Link
          href={`/clubs/${clubId}/teams/${teamId}/championships`}
          className="text-sm text-muted-foreground underline"
        >
          {t("back")}
        </Link>
        <p className="text-sm text-destructive">{t("loadFailed")}</p>
      </div>
    );
  }

  if (!championship) {
    return null;
  }

  return (
    <div className="flex w-full flex-col gap-4 p-4">
      <Link
        href={`/clubs/${clubId}/teams/${teamId}/championships`}
        className="text-sm text-muted-foreground underline"
      >
        {t("back")}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{championship.name}</h1>
          <p className="text-sm text-muted-foreground">
            {championship.season.name} · {formatDate(championship.startDate)} –{" "}
            {formatDate(championship.endDate)}
          </p>
        </div>
        {championship.canManage && (
          <div className="flex items-center gap-2">
            <ChampionshipFormDialog
              clubId={clubId}
              teamId={teamId}
              championship={championship}
              onSuccess={loadChampionship}
              trigger={<Button variant="outline">{t("edit")}</Button>}
            />
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
          </div>
        )}
      </div>

      <Tabs defaultValue="participants">
        <TabsList>
          <TabsTrigger value="participants">{t("tabs.participants")}</TabsTrigger>
          <TabsTrigger value="matches">{t("tabs.matches")}</TabsTrigger>
          <TabsTrigger value="standings">{t("tabs.standings")}</TabsTrigger>
        </TabsList>
        <TabsContent value="participants">
          <ParticipantsTab clubId={clubId} teamId={teamId} championshipId={championshipId} />
        </TabsContent>
        <TabsContent value="matches">
          <MatchesTab clubId={clubId} teamId={teamId} championshipId={championshipId} />
        </TabsContent>
        <TabsContent value="standings">
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              {t("standingsComingSoon")}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function ChampionshipDetailPage({
  params,
}: {
  params: Promise<{ clubId: string; teamId: string; championshipId: string }>;
}) {
  const { clubId, teamId, championshipId } = use(params);
  return (
    <ChampionshipDetailPageContent
      clubId={clubId}
      teamId={teamId}
      championshipId={championshipId}
    />
  );
}
