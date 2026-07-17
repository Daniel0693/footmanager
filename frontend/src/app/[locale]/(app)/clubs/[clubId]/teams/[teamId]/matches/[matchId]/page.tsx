"use client";

import { useLocale, useTranslations } from "next-intl";
import { use, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MatchEditDialog } from "@/components/matches/match-edit-dialog";
import { PreMatchTab } from "@/components/matches/pre-match-tab";
import { Link } from "@/i18n/navigation";
import { apiFetch, authHeaders } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import type { GameFormat } from "@/lib/formations";

type MatchType = "CHAMPIONNAT" | "COUPE" | "AMICAL" | "TOURNOI";
type LiveMatchStatus =
  | "SCHEDULED"
  | "LIVE"
  | "HALFTIME"
  | "FINISHED"
  | "CANCELLED"
  | "POSTPONED";
type HomeOrAway = "HOME" | "AWAY";

interface MatchDetail {
  id: number;
  matchType: MatchType;
  homeOrAway: HomeOrAway;
  status: LiveMatchStatus;
  scoreHome: number | null;
  scoreAway: number | null;
  gameFormat: GameFormat | null;
  cupRound: string | null;
  opponentExternalTeamId: number | null;
  opponentExternalTeam: { id: number; name: string } | null;
  canManage: boolean;
  event: {
    id: number;
    title: string;
    startAt: string;
    endAt: string | null;
    location: string | null;
    description: string | null;
  };
}

const DETAIL_TABS = ["avantMatch", "live", "postMatch"] as const;

// Composant nommé séparé du default export : voir la même note dans
// players/[playerId]/page.tsx — `use(params)` ne se résout pas de façon
// fiable sous Jest/jsdom.
export function MatchDetailPageContent({
  clubId,
  teamId,
  matchId,
}: {
  clubId: string;
  teamId: string;
  matchId: string;
}) {
  const t = useTranslations("matchDetail");
  const tMatches = useTranslations("matches");
  const locale = useLocale();
  const { accessToken } = useAuth();
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [hasError, setHasError] = useState(false);
  // Voir PreMatchTab (`matchRefreshKey`) : incrémenté seulement après une
  // édition réussie du match (jamais au montage initial, contrairement à
  // reloadMatch) pour forcer CompositionColumn à recharger le gameFormat/la
  // liste de dispositifs (retour utilisateur du 2026-07-18 — la liste ne
  // suivait pas un changement de format fait depuis Modifier).
  const [matchRefreshKey, setMatchRefreshKey] = useState(0);

  const fetchMatch = useCallback(async () => {
    const response = await apiFetch(
      `/clubs/${clubId}/teams/${teamId}/matches/${matchId}`,
      { headers: authHeaders(accessToken) },
    );
    if (!response.ok) throw new Error();
    return response.json();
  }, [clubId, teamId, matchId, accessToken]);

  const reloadMatch = useCallback(async () => {
    try {
      const data = await fetchMatch();
      setMatch(data);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [fetchMatch, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadMatch();
  }, [reloadMatch]);

  if (hasError) {
    return (
      <div className="flex w-full flex-col gap-4 p-4">
        <Link
          href={`/clubs/${clubId}/teams/${teamId}/calendar`}
          className="text-sm text-muted-foreground underline"
        >
          {t("backToCalendar")}
        </Link>
        <p className="text-sm text-destructive">{t("loadFailed")}</p>
      </div>
    );
  }

  if (!match) {
    return null;
  }

  const scoreLabel =
    match.scoreHome !== null && match.scoreAway !== null
      ? match.homeOrAway === "HOME"
        ? `${match.scoreHome} – ${match.scoreAway}`
        : `${match.scoreAway} – ${match.scoreHome}`
      : null;

  return (
    // lg:h-full lg:min-h-0 : borne la hauteur à l'espace disponible sous le
    // header de l'app (fourni par AppShell, main flex-1 min-h-0
    // overflow-y-auto) plutôt que de suivre la hauteur du contenu — sans ça,
    // aucune zone interne (ex. colonne Convocations, PreMatchTab) ne peut
    // défiler en interne : elle grandirait indéfiniment et ferait défiler la
    // page entière à la place (retour utilisateur du 2026-07-17). Même motif
    // que players/[playerId]/page.tsx.
    <div className="flex w-full flex-col gap-4 p-4 lg:h-full lg:min-h-0">
      <Link
        href={`/clubs/${clubId}/teams/${teamId}/calendar`}
        className="shrink-0 text-sm text-muted-foreground underline"
      >
        {t("backToCalendar")}
      </Link>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-heading text-xl font-semibold">{match.event.title}</h1>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>
              {new Date(match.event.startAt).toLocaleString(locale, {
                weekday: "short",
                day: "2-digit",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span>·</span>
            <span>{tMatches(`type${match.matchType}`)}</span>
            <span>·</span>
            <span>{tMatches(`homeOrAway${match.homeOrAway}`)}</span>
            {match.event.location && (
              <>
                <span>·</span>
                <span>{match.event.location}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {scoreLabel && (
            <Badge variant="default" className="text-base">
              {scoreLabel}
            </Badge>
          )}
          <Badge variant="outline">{t(`status${match.status}`)}</Badge>
          {match.canManage && (
            <MatchEditDialog
              clubId={clubId}
              teamId={teamId}
              match={match}
              onSuccess={() => {
                setMatchRefreshKey((key) => key + 1);
                void reloadMatch();
              }}
              trigger={
                <Button variant="outline" size="sm">
                  {t("edit")}
                </Button>
              }
            />
          )}
        </div>
      </div>

      <Tabs defaultValue="avantMatch" className="lg:min-h-0 lg:flex-1">
        <TabsList className="flex-wrap">
          {DETAIL_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {t(`tabs.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="avantMatch" className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
          <PreMatchTab
            clubId={clubId}
            teamId={teamId}
            matchId={matchId}
            matchRefreshKey={matchRefreshKey}
          />
        </TabsContent>
        {DETAIL_TABS.filter((tab) => tab !== "avantMatch").map((tab) => (
          <TabsContent key={tab} value={tab}>
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                {t("comingSoon")}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export default function MatchDetailPage({
  params,
}: {
  params: Promise<{ clubId: string; teamId: string; matchId: string }>;
}) {
  const { clubId, teamId, matchId } = use(params);
  return <MatchDetailPageContent clubId={clubId} teamId={teamId} matchId={matchId} />;
}
