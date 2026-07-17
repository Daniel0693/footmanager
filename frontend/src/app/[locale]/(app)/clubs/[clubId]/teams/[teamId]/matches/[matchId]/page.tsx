"use client";

import { useLocale, useTranslations } from "next-intl";
import { use, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PreMatchTab } from "@/components/matches/pre-match-tab";
import { Link } from "@/i18n/navigation";
import { apiFetch, authHeaders } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";

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
  canManage: boolean;
  event: {
    id: number;
    title: string;
    startAt: string;
    location: string | null;
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

  const fetchMatch = useCallback(async () => {
    const response = await apiFetch(
      `/clubs/${clubId}/teams/${teamId}/matches/${matchId}`,
      { headers: authHeaders(accessToken) },
    );
    if (!response.ok) throw new Error();
    return response.json();
  }, [clubId, teamId, matchId, accessToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchMatch();
        if (!cancelled) {
          setMatch(data);
          setHasError(false);
        }
      } catch {
        if (!cancelled) {
          setHasError(true);
          toast.error(t("loadFailed"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchMatch, t]);

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
    <div className="flex w-full flex-col gap-4 p-4">
      <Link
        href={`/clubs/${clubId}/teams/${teamId}/calendar`}
        className="text-sm text-muted-foreground underline"
      >
        {t("backToCalendar")}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2">
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
        </div>
      </div>

      <Tabs defaultValue="avantMatch">
        <TabsList className="flex-wrap">
          {DETAIL_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {t(`tabs.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="avantMatch">
          <PreMatchTab clubId={clubId} teamId={teamId} matchId={matchId} />
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
