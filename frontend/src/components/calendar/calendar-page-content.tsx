"use client";

import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarMonthView } from "@/components/calendar/calendar-month-view";
import { CalendarWeekView } from "@/components/calendar/calendar-week-view";
import {
  EventFormDialog,
  type EventFormTeam,
  type ExistingEvent,
} from "@/components/calendar/event-form-dialog";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { EVENT_TYPES, type EventType } from "@/lib/event";

type CalendarEvent = ExistingEvent;

type GridDialogState =
  | { open: false }
  | { open: true; mode: "create"; start: Date; end?: Date }
  | { open: true; mode: "edit"; event: CalendarEvent };

function toQueryString(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val) search.set(key, val);
  }
  return search.toString();
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function CalendarPageContent({ clubId }: { clubId: string }) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const { accessToken } = useAuth();

  const [teams, setTeams] = useState<EventFormTeam[] | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<Set<EventType>>(
    () => new Set(EVENT_TYPES),
  );
  // null tant que "mes équipes" n'a pas encore répondu : le calendrier ne
  // doit pas se charger avant d'avoir un premier jeu d'équipes accessibles.
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<number> | null>(null);

  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [hasError, setHasError] = useState(false);

  const [view, setView] = useState<"list" | "month" | "week">("list");
  const [month, setMonth] = useState(() => new Date());
  const [week, setWeek] = useState(() => new Date());
  // Dialogue piloté par la grille mensuelle/hebdomadaire (clic/glisser sur
  // une cellule ou clic sur un événement) — distinct des EventFormDialog à
  // trigger visible utilisés par le bouton "Ajouter" et la vue Liste.
  const [gridDialog, setGridDialog] = useState<GridDialogState>({ open: false });

  // Vue AdminClub (multi-équipe) : code couleur par équipe. Vue Coach/Player
  // (une seule équipe accessible) : code couleur par type — proxy simple sur
  // le rôle réel, non exposé côté frontend (docs/modules/calendrier-evenements.md
  // §Code couleur ; voir aussi docs/roadmap.md étape B5, décision documentée).
  const colorMode: "type" | "team" = (teams?.length ?? 0) > 1 ? "team" : "type";

  const loadTeams = useCallback(async () => {
    try {
      const response = await apiFetch(`/clubs/${clubId}/teams/mine`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error();
      const data: EventFormTeam[] = await response.json();
      setTeams(data);
      setSelectedTeamIds(new Set(data.map((team) => team.id)));
    } catch {
      toast.error(t("teamsLoadFailed"));
    }
  }, [clubId, accessToken, t]);

  useEffect(() => {
    // Bootstrap volontaire : charge les équipes accessibles au montage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTeams();
  }, [loadTeams]);

  // Filtres toujours résolus côté backend (décision du 2026-07-06, voir
  // docs/modules/effectif-joueurs.md §Mesures) : les cases à cocher
  // retransmettent la sélection en query, jamais de filtrage en mémoire.
  const fetchEvents = useCallback(async () => {
    const query = toQueryString({
      types: [...selectedTypes].join(","),
      teamIds: selectedTeamIds ? [...selectedTeamIds].join(",") : undefined,
      sortOrder: "asc",
    });
    const response = await apiFetch(`/clubs/${clubId}/events/mine?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error();
    return response.json();
  }, [clubId, accessToken, selectedTypes, selectedTeamIds]);

  // Case à cocher toutes décochées (type ou équipe) : calendrier vide sans
  // aller-retour réseau, plutôt que de renvoyer "aucun filtre" au backend.
  const isEmptySelection = () =>
    selectedTypes.size === 0 || selectedTeamIds?.size === 0;

  const load = useCallback(async () => {
    if (isEmptySelection()) {
      setEvents([]);
      setHasError(false);
      return;
    }
    try {
      const data = await fetchEvents();
      setEvents(data);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchEvents, selectedTypes, selectedTeamIds, t]);

  useEffect(() => {
    if (selectedTeamIds === null) return;
    let cancelled = false;
    (async () => {
      if (selectedTypes.size === 0 || selectedTeamIds.size === 0) {
        if (!cancelled) {
          setEvents([]);
          setHasError(false);
        }
        return;
      }
      try {
        const data = await fetchEvents();
        if (!cancelled) {
          setEvents(data);
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
  }, [fetchEvents, selectedTypes, selectedTeamIds, t]);

  const toggleType = (type: EventType) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const toggleTeam = (teamId: number) => {
    setSelectedTeamIds((prev) => {
      if (!prev) return prev;
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  // Clic (start === end) ou glisser (docs/modules/calendrier-evenements.md
  // §Création) sur une cellule de la grille mensuelle : ouvre le dialogue de
  // création pré-rempli, sans endAt si un seul jour a été sélectionné.
  const handleSelectRange = (start: Date, end: Date) => {
    setGridDialog({
      open: true,
      mode: "create",
      start,
      end: isSameDay(start, end) ? undefined : end,
    });
  };

  const handleEditFromGrid = (event: CalendarEvent) => {
    setGridDialog({ open: true, mode: "edit", event });
  };

  const handleDelete = async (item: CalendarEvent) => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${item.team.id}/events/${item.id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok) throw new Error();
      await load();
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

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Barre latérale de filtres (docs/modules/calendrier-evenements.md §Filtres) */}
      <Card className="h-fit w-full shrink-0 lg:w-60">
        <CardHeader>
          <CardTitle className="text-sm">{t("filtersTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">{t("typeFilter")}</Label>
            {EVENT_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selectedTypes.has(type)}
                  onCheckedChange={() => toggleType(type)}
                />
                {t(`type${type}`)}
              </label>
            ))}
          </div>
          {teams && teams.length > 1 && (
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-muted-foreground">{t("teamFilter")}</Label>
              {teams.map((team) => (
                <label key={team.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedTeamIds?.has(team.id) ?? false}
                    onCheckedChange={() => toggleTeam(team.id)}
                  />
                  {team.name}
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <Tabs
            value={view}
            onValueChange={(value) => setView(value as "list" | "month" | "week")}
          >
            <TabsList>
              <TabsTrigger value="list">{t("viewList")}</TabsTrigger>
              <TabsTrigger value="week">{t("viewWeek")}</TabsTrigger>
              <TabsTrigger value="month">{t("viewMonth")}</TabsTrigger>
            </TabsList>
          </Tabs>
          <EventFormDialog
            clubId={clubId}
            teams={teams ?? []}
            onSuccess={load}
            trigger={
              <Button disabled={!teams || teams.length === 0}>
                <Plus />
                {t("add")}
              </Button>
            }
          />
        </div>

        {hasError && <p className="text-sm text-destructive">{t("loadFailed")}</p>}

        {view === "month" ? (
          <CalendarMonthView
            month={month}
            onMonthChange={setMonth}
            events={events ?? []}
            teams={teams ?? []}
            colorMode={colorMode}
            onSelectRange={handleSelectRange}
            onEditEvent={handleEditFromGrid}
          />
        ) : view === "week" ? (
          <CalendarWeekView
            week={week}
            onWeekChange={setWeek}
            events={events ?? []}
            teams={teams ?? []}
            colorMode={colorMode}
            onSelectRange={handleSelectRange}
            onEditEvent={handleEditFromGrid}
          />
        ) : !hasError && events !== null && events.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              {t("empty")}
            </CardContent>
          </Card>
        ) : (
          !hasError &&
          events !== null && (
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
                            teams={teams ?? []}
                            event={event}
                            onSuccess={load}
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
          )
        )}
      </div>

      {/* Dialogue piloté par la grille mensuelle/hebdomadaire : clic/glisser
          sur une cellule (création) ou clic sur un événement (édition) —
          sans bouton déclencheur visible, voir EventFormDialog open
          contrôlé. */}
      <EventFormDialog
        clubId={clubId}
        teams={teams ?? []}
        open={gridDialog.open}
        onOpenChange={(open) => {
          if (!open) setGridDialog({ open: false });
        }}
        event={gridDialog.open && gridDialog.mode === "edit" ? gridDialog.event : undefined}
        defaultDate={gridDialog.open && gridDialog.mode === "create" ? gridDialog.start : undefined}
        defaultEndDate={gridDialog.open && gridDialog.mode === "create" ? gridDialog.end : undefined}
        onSuccess={() => {
          setGridDialog({ open: false });
          void load();
        }}
      />
    </div>
  );
}
