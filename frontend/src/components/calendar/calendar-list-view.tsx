"use client";

import { Cake, MapPin, Pencil, Trash2 } from "lucide-react";
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
import { DeleteEventDialog } from "@/components/calendar/delete-event-dialog";
import { apiFetch, authHeaders } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { addDays, endOfDay } from "@/lib/calendar-grid";
import { formatDate } from "@/lib/date-format";
import {
  fetchBirthdayEvents,
  fetchCalendarEvents,
  isEmptyFilterSelection,
  isFiltersReady,
  type Birthday,
  type EventFilters,
} from "@/lib/calendar-events-api";

type CalendarEvent = ExistingEvent;

// Fusion chronologique événements + anniversaires (docs/modules/
// calendrier-evenements.md) — un anniversaire n'est jamais un ExistingEvent
// (voir lib/calendar-events-api.ts), donc pas cliquable/éditable, juste un
// élément visuel distinct dans la même timeline.
type TimelineItem =
  | { kind: "event"; date: string; event: CalendarEvent }
  | { kind: "birthday"; date: string; birthday: Birthday };

// Fenêtre initiale centrée sur aujourd'hui, étendue par blocs de CHUNK_DAYS
// au scroll (docs/roadmap.md étape B6, corrections post-revue) — jamais tout
// l'historique/futur d'un coup.
const INITIAL_PAST_DAYS = 14;
const INITIAL_FUTURE_DAYS = 60;
const CHUNK_DAYS = 30;
const SCROLL_THRESHOLD_PX = 200;
// Corrections post-B9 (2026-07-09) : avec peu d'événements/anniversaires
// dans la fenêtre initiale, la liste ne remplit pas la hauteur visible —
// aucun scroll possible, donc aucun moyen de déclencher loadOlder/loadNewer
// pour découvrir un anniversaire ou un événement juste hors fenêtre. La
// fenêtre s'étend donc automatiquement (alterné passé/futur) tant qu'elle
// contient moins de MIN_TIMELINE_ITEMS éléments, plafonné à
// MAX_AUTO_EXPANSIONS itérations pour rester borné en requêtes réseau.
const MIN_TIMELINE_ITEMS = 8;
const MAX_AUTO_EXPANSIONS = 6;

export function CalendarListView({
  clubId,
  teams,
  filters,
  refreshKey,
  recenterKey,
}: {
  clubId: string;
  teams: EventFormTeam[];
  filters: EventFilters;
  refreshKey: number;
  // Incrémenté par le bouton "Aujourd'hui" (CalendarPageContent) : force le
  // recentrage sur la fenêtre initiale plutôt que de recharger la fenêtre
  // actuellement ouverte (comportement normal de refreshKey).
  recenterKey: number;
}) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const { accessToken } = useAuth();

  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [hasError, setHasError] = useState(false);
  const [pastBoundary, setPastBoundary] = useState<Date | null>(null);
  const [futureBoundary, setFutureBoundary] = useState<Date | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Miroirs en ref des bornes : lus par l'effet de (re)chargement sans y
  // être une dépendance, pour ne pas redéclencher un chargement complet à
  // chaque extension de fenêtre pendant le scroll.
  const boundsRef = useRef<{ from: Date; to: Date } | null>(null);
  // Compteur d'extensions automatiques de fenêtre (voir MAX_AUTO_EXPANSIONS)
  // — remis à zéro à chaque nouvelle fenêtre initiale (montage, recentrage,
  // changement de filtres), jamais pendant une extension manuelle au scroll.
  const autoExpandCount = useRef(0);
  // Génération du cycle courant (montage/filtres/refresh/recentrage) —
  // incrémentée à chaque nouveau cycle. loadOlder/loadNewer sont invoquées
  // de façon impérative (scroll, effet d'extension automatique), donc sans
  // le nettoyage automatique d'un effet React : sans ce garde-fou, un appel
  // encore en vol au moment d'un clic "Aujourd'hui" applique son résultat
  // (bornes/événements) une fois le cycle suivant déjà démarré, ce qui
  // rouvre une fenêtre censée avoir été réinitialisée (bug observé :
  // doublons d'anniversaire après plusieurs clics rapprochés).
  const generationRef = useRef(0);

  useEffect(() => {
    boundsRef.current =
      pastBoundary && futureBoundary ? { from: pastBoundary, to: futureBoundary } : null;
  }, [pastBoundary, futureBoundary]);

  // "Aujourd'hui" : efface la fenêtre mémorisée avant que l'effet de
  // chargement ci-dessous ne s'exécute, pour qu'il retombe sur la fenêtre
  // initiale centrée sur aujourd'hui plutôt que de recharger la fenêtre
  // actuellement ouverte.
  useEffect(() => {
    boundsRef.current = null;
    autoExpandCount.current = 0;
  }, [recenterKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isFiltersReady(filters)) return;
      // Nouveau cycle (filtres/refresh/recentrage) : redonne un budget
      // d'extension automatique complet, indépendant des tentatives faites
      // sous une combinaison de filtres différente, et invalide tout appel
      // loadOlder/loadNewer du cycle précédent encore en vol.
      autoExpandCount.current = 0;
      generationRef.current += 1;
      // Recharge la fenêtre déjà ouverte si elle existe (évite de recentrer
      // sur aujourd'hui après une simple création/édition pendant que
      // l'utilisateur est ailleurs dans le temps) ; sinon fenêtre initiale
      // centrée sur aujourd'hui. Calculée même si la sélection de types/
      // équipes est vide : les anniversaires (filtre indépendant, effet
      // ci-dessous) dépendent de cette fenêtre et doivent pouvoir s'afficher
      // seuls, sans qu'aucun type d'événement ne soit coché.
      const existing = boundsRef.current;
      const from = existing?.from ?? addDays(new Date(), -INITIAL_PAST_DAYS);
      const to = existing?.to ?? endOfDay(addDays(new Date(), INITIAL_FUTURE_DAYS));
      if (isEmptyFilterSelection(filters)) {
        if (!cancelled) {
          setEvents([]);
          setHasError(false);
          setPastBoundary(from);
          setFutureBoundary(to);
        }
        return;
      }
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
          if (!existing) {
            // Fenêtre initiale (montage ou recentrage) : repart du haut de
            // la liste plutôt que de garder la position de scroll d'une
            // fenêtre précédente qui n'existe plus.
            requestAnimationFrame(() => {
              if (scrollRef.current) scrollRef.current.scrollTop = 0;
            });
          }
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
  }, [clubId, accessToken, filters, refreshKey, recenterKey, t]);

  // Recharge sur toute la fenêtre courante (pas de pagination séparée pour
  // les anniversaires — requête légère, contrairement aux événements) dès
  // que les bornes changent, quelle qu'en soit la cause (chargement initial,
  // scroll infini, recentrage).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!filters.showBirthdays || !pastBoundary || !futureBoundary) {
        if (!cancelled) setBirthdays([]);
        return;
      }
      try {
        const data = await fetchBirthdayEvents(
          clubId,
          accessToken,
          { dateFrom: pastBoundary, dateTo: futureBoundary },
          filters.teamIds,
        );
        if (!cancelled) setBirthdays(data);
      } catch {
        // Anniversaires optionnels : une erreur ici ne doit pas casser
        // l'affichage des événements déjà chargés.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clubId, accessToken, filters.showBirthdays, filters.teamIds, pastBoundary, futureBoundary]);

  const loadOlder = useCallback(async () => {
    if (!pastBoundary || isLoadingMore) return;
    // Fige la génération au moment de l'appel : si un nouveau cycle démarre
    // (recentrage, changement de filtres) avant que cet appel ne se termine,
    // son résultat est ignoré plutôt qu'appliqué sur un état déjà périmé.
    const myGeneration = generationRef.current;
    const newBoundary = addDays(pastBoundary, -CHUNK_DAYS);
    // Sélection de types/équipes vide : aucun événement ne peut jamais
    // apparaître, inutile d'appeler le backend — élargit quand même la
    // fenêtre pour que l'effet anniversaires (filtre indépendant) en
    // profite.
    if (isEmptyFilterSelection(filters)) {
      if (generationRef.current === myGeneration) setPastBoundary(newBoundary);
      return;
    }
    setIsLoadingMore(true);
    try {
      const data = await fetchCalendarEvents(clubId, accessToken, filters, {
        dateFrom: newBoundary,
        dateTo: endOfDay(addDays(pastBoundary, -1)),
        sortOrder: "asc",
      });
      if (generationRef.current !== myGeneration) return;
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
      if (generationRef.current === myGeneration) toast.error(t("loadFailed"));
    } finally {
      // Toujours réinitialisé, même si le résultat a été ignoré (génération
      // périmée) : ce flag verrouille les appels loadOlder/loadNewer du
      // cycle ACTUEL, pas seulement de celui qui l'a posé — le laisser à
      // `true` bloquerait indéfiniment le nouveau cycle.
      setIsLoadingMore(false);
    }
  }, [clubId, accessToken, filters, pastBoundary, isLoadingMore, t]);

  const loadNewer = useCallback(async () => {
    if (!futureBoundary || isLoadingMore) return;
    const myGeneration = generationRef.current;
    const newBoundary = endOfDay(addDays(futureBoundary, CHUNK_DAYS));
    if (isEmptyFilterSelection(filters)) {
      if (generationRef.current === myGeneration) setFutureBoundary(newBoundary);
      return;
    }
    setIsLoadingMore(true);
    try {
      const data = await fetchCalendarEvents(clubId, accessToken, filters, {
        dateFrom: addDays(futureBoundary, 1),
        dateTo: newBoundary,
        sortOrder: "asc",
      });
      if (generationRef.current !== myGeneration) return;
      setEvents((prev) => [...(prev ?? []), ...data]);
      setFutureBoundary(newBoundary);
    } catch {
      if (generationRef.current === myGeneration) toast.error(t("loadFailed"));
    } finally {
      setIsLoadingMore(false);
    }
  }, [clubId, accessToken, filters, futureBoundary, isLoadingMore, t]);

  // Extension automatique tant que la fenêtre affiche trop peu d'éléments
  // pour remplir la zone visible (voir MIN_TIMELINE_ITEMS ci-dessus) — sans
  // ça, une liste trop courte pour déborder ne peut jamais déclencher
  // handleScroll, laissant un anniversaire juste hors fenêtre introuvable.
  // Alterne passé/futur à chaque extension plutôt que les deux à la fois,
  // pour ne jamais chevaucher avec le flag isLoadingMore partagé.
  //
  // Portée volontairement restreinte à la sélection de types/équipes vide
  // (le bug réellement signalé : seul le filtre "Anniversaires" actif, 0
  // événement possible) plutôt que généralisée à toute fenêtre pauvre en
  // événements réels : dans ce cas précis, loadOlder/loadNewer n'appellent
  // jamais fetchCalendarEvents (voir plus haut), donc aucun risque de
  // chevauchement avec un chargement au scroll déclenché par l'utilisateur
  // (isLoadingMore n'est jamais posé sur ce chemin). Étendre au cas général
  // impliquerait ce risque de chevauchement bien réel avec le scroll manuel
  // — à revisiter si un besoin similaire est signalé avec de vrais
  // événements, pas seulement des anniversaires.
  useEffect(() => {
    if (events === null || hasError || isLoadingMore) return;
    if (!isFiltersReady(filters)) return;
    if (!isEmptyFilterSelection(filters) || !filters.showBirthdays) return;
    if (birthdays.length >= MIN_TIMELINE_ITEMS) return;
    if (autoExpandCount.current >= MAX_AUTO_EXPANSIONS) return;
    autoExpandCount.current += 1;
    if (autoExpandCount.current % 2 === 1) {
      void loadOlder();
    } else {
      void loadNewer();
    }
  }, [events, birthdays, hasError, isLoadingMore, filters, loadOlder, loadNewer]);

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

  // scope "future" (événement récurrent, docs/schema/evenements.md) supprime
  // plusieurs occurrences à la fois : recharge la fenêtre plutôt que de
  // recalculer localement quelles occurrences ont été touchées.
  const handleDelete = async (item: CalendarEvent, scope: "single" | "future") => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${item.team.id}/events/${item.id}?scope=${scope}`,
        { method: "DELETE", headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error();
      if (scope === "future") {
        await reloadCurrentWindow();
      } else {
        setEvents((prev) => prev?.filter((existing) => existing.id !== item.id) ?? null);
      }
    } catch {
      toast.error(t("deleteFailed"));
    }
  };

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

  const timelineItems: TimelineItem[] =
    events === null
      ? []
      : [
          ...events.map((event): TimelineItem => ({ kind: "event", date: event.startAt, event })),
          ...birthdays.map((birthday): TimelineItem => ({
            kind: "birthday",
            date: birthday.date,
            birthday,
          })),
        ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      data-testid="calendar-list-scroll"
      className="flex flex-1 flex-col gap-3 lg:min-h-0 lg:overflow-y-auto"
    >
      {hasError && <p className="text-sm text-destructive">{t("loadFailed")}</p>}
      {!hasError && events !== null && timelineItems.length === 0 && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">{t("empty")}</CardContent>
        </Card>
      )}
      {!hasError && events !== null && timelineItems.length > 0 && (
        <ol className="flex flex-col gap-3">
          {timelineItems.map((item) =>
            item.kind === "birthday" ? (
              <li key={`birthday-${item.birthday.memberId}-${item.date}`}>
                <Card className="bg-muted/40">
                  <CardContent className="flex items-center gap-2 py-3 text-sm">
                    <Cake className="size-4 shrink-0 text-muted-foreground" />
                    <span>
                      {t("birthdayAgeWithDate", {
                        firstName: item.birthday.firstName,
                        lastName: item.birthday.lastName,
                        date: formatDate(item.birthday.date),
                        age: item.birthday.age,
                      })}
                    </span>
                  </CardContent>
                </Card>
              </li>
            ) : (
              <li key={item.event.id}>
                <Card>
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{t(`type${item.event.type}`)}</Badge>
                        <Badge variant="outline">{item.event.team.name}</Badge>
                        <span className="font-medium">{item.event.title}</span>
                      </div>
                      <div className="flex gap-1">
                        <EventFormDialog
                          clubId={clubId}
                          teams={teams}
                          event={item.event}
                          onSuccess={() => void reloadCurrentWindow()}
                          trigger={
                            <Button variant="ghost" size="icon" aria-label={t("edit")}>
                              <Pencil />
                            </Button>
                          }
                        />
                        <DeleteEventDialog
                          event={item.event}
                          onConfirm={(scope) => void handleDelete(item.event, scope)}
                          trigger={
                            <Button variant="ghost" size="icon" aria-label={t("delete")}>
                              <Trash2 className="text-destructive" />
                            </Button>
                          }
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {formatDateTime(item.event.startAt)}
                        {item.event.endAt && ` – ${formatTime(item.event.endAt)}`}
                      </span>
                      {item.event.location && (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="size-3.5" />
                          {item.event.location}
                        </span>
                      )}
                    </div>
                    {item.event.description && (
                      <p className="text-sm whitespace-pre-wrap">{item.event.description}</p>
                    )}
                  </CardContent>
                </Card>
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  );
}
