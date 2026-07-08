"use client";

import { MapPin, Pencil, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  EventFormDialog,
  type EventFormTeam,
  type ExistingEvent,
} from "@/components/calendar/event-form-dialog";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { addDays, endOfDay } from "@/lib/calendar-grid";
import {
  fetchCalendarEvents,
  isEmptyFilterSelection,
  isFiltersReady,
  type EventFilters,
} from "@/lib/calendar-events-api";

type CalendarEvent = ExistingEvent;

// Fenêtre initiale centrée sur aujourd'hui, étendue par blocs de CHUNK_DAYS
// au scroll (docs/roadmap.md étape B6, corrections post-revue) — jamais tout
// l'historique/futur d'un coup.
const INITIAL_PAST_DAYS = 14;
const INITIAL_FUTURE_DAYS = 60;
const CHUNK_DAYS = 30;
const SCROLL_THRESHOLD_PX = 200;

export function CalendarListView({
  clubId,
  teams,
  filters,
  refreshKey,
}: {
  clubId: string;
  teams: EventFormTeam[];
  filters: EventFilters;
  refreshKey: number;
}) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const { accessToken } = useAuth();

  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [hasError, setHasError] = useState(false);
  const [pastBoundary, setPastBoundary] = useState<Date | null>(null);
  const [futureBoundary, setFutureBoundary] = useState<Date | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Miroirs en ref des bornes : lus par l'effet de (re)chargement sans y
  // être une dépendance, pour ne pas redéclencher un chargement complet à
  // chaque extension de fenêtre pendant le scroll.
  const boundsRef = useRef<{ from: Date; to: Date } | null>(null);

  useEffect(() => {
    boundsRef.current =
      pastBoundary && futureBoundary ? { from: pastBoundary, to: futureBoundary } : null;
  }, [pastBoundary, futureBoundary]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isFiltersReady(filters)) return;
      if (isEmptyFilterSelection(filters)) {
        if (!cancelled) {
          setEvents([]);
          setHasError(false);
          setPastBoundary(null);
          setFutureBoundary(null);
        }
        return;
      }
      // Recharge la fenêtre déjà ouverte si elle existe (évite de recentrer
      // sur aujourd'hui après une simple création/édition pendant que
      // l'utilisateur est ailleurs dans le temps) ; sinon fenêtre initiale
      // centrée sur aujourd'hui.
      const existing = boundsRef.current;
      const from = existing?.from ?? addDays(new Date(), -INITIAL_PAST_DAYS);
      const to = existing?.to ?? endOfDay(addDays(new Date(), INITIAL_FUTURE_DAYS));
      try {
        const data = await fetchCalendarEvents(clubId, accessToken, filters, {
          dateFrom: from,
          dateTo: to,
          sortOrder: "asc",
        });
        if (!cancelled) {
          setEvents(data);
          setPastBoundary(from);
          setFutureBoundary(to);
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
  }, [clubId, accessToken, filters, refreshKey, t]);

  const loadOlder = useCallback(async () => {
    if (!pastBoundary || isLoadingMore) return;
    setIsLoadingMore(true);
    const newBoundary = addDays(pastBoundary, -CHUNK_DAYS);
    try {
      const data = await fetchCalendarEvents(clubId, accessToken, filters, {
        dateFrom: newBoundary,
        dateTo: endOfDay(addDays(pastBoundary, -1)),
        sortOrder: "asc",
      });
      const container = scrollRef.current;
      const previousScrollHeight = container?.scrollHeight ?? 0;
      setEvents((prev) => [...data, ...(prev ?? [])]);
      setPastBoundary(newBoundary);
      // Compense le décalage visuel provoqué par l'ajout de contenu en haut
      // de la liste — technique standard pour un scroll infini "vers le
      // passé", sans quoi la fenêtre visible saute au moment du prepend.
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop += container.scrollHeight - previousScrollHeight;
        }
      });
    } catch {
      toast.error(t("loadFailed"));
    } finally {
      setIsLoadingMore(false);
    }
  }, [clubId, accessToken, filters, pastBoundary, isLoadingMore, t]);

  const loadNewer = useCallback(async () => {
    if (!futureBoundary || isLoadingMore) return;
    setIsLoadingMore(true);
    const newBoundary = endOfDay(addDays(futureBoundary, CHUNK_DAYS));
    try {
      const data = await fetchCalendarEvents(clubId, accessToken, filters, {
        dateFrom: addDays(futureBoundary, 1),
        dateTo: newBoundary,
        sortOrder: "asc",
      });
      setEvents((prev) => [...(prev ?? []), ...data]);
      setFutureBoundary(newBoundary);
    } catch {
      toast.error(t("loadFailed"));
    } finally {
      setIsLoadingMore(false);
    }
  }, [clubId, accessToken, filters, futureBoundary, isLoadingMore, t]);

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    if (container.scrollTop < SCROLL_THRESHOLD_PX) {
      void loadOlder();
    } else if (
      container.scrollHeight - container.scrollTop - container.clientHeight <
      SCROLL_THRESHOLD_PX
    ) {
      void loadNewer();
    }
  };

  const handleDelete = async (item: CalendarEvent) => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${item.team.id}/events/${item.id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok) throw new Error();
      setEvents((prev) => prev?.filter((existing) => existing.id !== item.id) ?? null);
    } catch {
      toast.error(t("deleteFailed"));
    }
  };

  // EventFormDialog ne renvoie pas la ressource mise à jour (onSuccess est
  // un simple signal) : on recharge la fenêtre actuellement ouverte plutôt
  // que d'essayer de fusionner un objet partiel dans la liste en mémoire.
  const reloadCurrentWindow = useCallback(async () => {
    if (!pastBoundary || !futureBoundary) return;
    try {
      const data = await fetchCalendarEvents(clubId, accessToken, filters, {
        dateFrom: pastBoundary,
        dateTo: futureBoundary,
        sortOrder: "asc",
      });
      setEvents(data);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [clubId, accessToken, filters, pastBoundary, futureBoundary, t]);

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      weekday: "short",
      day: "2-digit",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      data-testid="calendar-list-scroll"
      className="flex flex-1 flex-col gap-3 lg:min-h-0 lg:overflow-y-auto"
    >
      {hasError && <p className="text-sm text-destructive">{t("loadFailed")}</p>}
      {!hasError && events !== null && events.length === 0 && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">{t("empty")}</CardContent>
        </Card>
      )}
      {!hasError && events !== null && events.length > 0 && (
        <ol className="flex flex-col gap-3">
          {events.map((event) => (
            <li key={event.id}>
              <Card>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{t(`type${event.type}`)}</Badge>
                      <Badge variant="outline">{event.team.name}</Badge>
                      <span className="font-medium">{event.title}</span>
                    </div>
                    <div className="flex gap-1">
                      <EventFormDialog
                        clubId={clubId}
                        teams={teams}
                        event={event}
                        onSuccess={() => void reloadCurrentWindow()}
                        trigger={
                          <Button variant="ghost" size="icon" aria-label={t("edit")}>
                            <Pencil />
                          </Button>
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("delete")}
                        onClick={() => handleDelete(event)}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {formatDateTime(event.startAt)}
                      {event.endAt && ` – ${formatTime(event.endAt)}`}
                    </span>
                    {event.location && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="size-3.5" />
                        {event.location}
                      </span>
                    )}
                  </div>
                  {event.description && (
                    <p className="text-sm whitespace-pre-wrap">{event.description}</p>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
