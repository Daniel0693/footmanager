"use client";

import { Cake, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { EventFormTeam, ExistingEvent } from "@/components/calendar/event-form-dialog";
import { useAuth } from "@/lib/auth/auth-context";
import { eventTypeColorClass, teamColorClass } from "@/lib/calendar-color";
import {
  addDays,
  endOfDay,
  isMultiDay,
  isSameDay,
  startOfWeek,
  toDayKey,
} from "@/lib/calendar-grid";
import {
  fetchBirthdayEvents,
  fetchCalendarEvents,
  isEmptyFilterSelection,
  isFiltersReady,
  type Birthday,
  type EventFilters,
} from "@/lib/calendar-events-api";
import { cn } from "@/lib/utils";

type CalendarEvent = ExistingEvent;

// Plage horaire affichée (06h-23h) — grille scrollable si elle dépasse
// l'espace disponible, sans faire défiler la page (docs/roadmap.md étape
// B6, corrections post-revue).
const HOUR_START = 6;
const HOUR_END = 23;
const HOUR_HEIGHT_PX = 48;
const TOTAL_HOURS = HOUR_END - HOUR_START;

// Durée par défaut affichée pour un événement sans endAt — purement visuel,
// n'écrit rien en base.
const DEFAULT_DURATION_HOURS = 1;

function timeToHourFraction(iso: string): number {
  const date = new Date(iso);
  return date.getHours() + date.getMinutes() / 60;
}

function effectiveEndFraction(event: CalendarEvent): number {
  if (event.endAt && isSameDay(new Date(event.startAt), new Date(event.endAt))) {
    return timeToHourFraction(event.endAt);
  }
  return timeToHourFraction(event.startAt) + DEFAULT_DURATION_HOURS;
}

// Répartit les événements chevauchants d'un même jour en colonnes côte à
// côte (algorithme glouton par "voies" — pas un compactage optimal comme
// Google Calendar, mais suffisant pour visualiser les chevauchements).
function assignLanes(dayEvents: CalendarEvent[]): Map<number, { lane: number; laneCount: number }> {
  const sorted = [...dayEvents].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
  const laneEnds: number[] = [];
  const laneByEventId = new Map<number, number>();
  for (const event of sorted) {
    const start = timeToHourFraction(event.startAt);
    const end = effectiveEndFraction(event);
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    laneByEventId.set(event.id, lane);
  }
  const laneCount = Math.max(laneEnds.length, 1);
  const result = new Map<number, { lane: number; laneCount: number }>();
  for (const [id, lane] of laneByEventId) {
    result.set(id, { lane, laneCount });
  }
  return result;
}

export function CalendarWeekView({
  clubId,
  week,
  onWeekChange,
  teams,
  filters,
  refreshKey,
  colorMode,
  onSelectRange,
  onEditEvent,
}: {
  clubId: string;
  week: Date;
  onWeekChange: (week: Date) => void;
  teams: EventFormTeam[];
  filters: EventFilters;
  refreshKey: number;
  colorMode: "type" | "team";
  onSelectRange: (start: Date, end: Date) => void;
  onEditEvent: (event: CalendarEvent) => void;
}) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const { accessToken } = useAuth();

  const weekStart = startOfWeek(week);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = days[6];

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isFiltersReady(filters)) return;
      if (isEmptyFilterSelection(filters)) {
        if (!cancelled) {
          setEvents([]);
          setHasError(false);
        }
        return;
      }
      try {
        const data = await fetchCalendarEvents(clubId, accessToken, filters, {
          dateFrom: weekStart,
          dateTo: endOfDay(weekEnd),
          sortOrder: "asc",
        });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, accessToken, filters, refreshKey, toDayKey(weekStart), t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!filters.showBirthdays || !isFiltersReady(filters)) {
        if (!cancelled) setBirthdays([]);
        return;
      }
      try {
        const data = await fetchBirthdayEvents(
          clubId,
          accessToken,
          { dateFrom: weekStart, dateTo: endOfDay(weekEnd) },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, accessToken, filters.showBirthdays, filters.teamIds, refreshKey, toDayKey(weekStart)]);

  const multiDayEvents = events.filter(isMultiDay);
  const timedEventsByDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    if (isMultiDay(event)) continue;
    const key = toDayKey(new Date(event.startAt));
    const list = timedEventsByDay.get(key) ?? [];
    list.push(event);
    timedEventsByDay.set(key, list);
  }

  const birthdaysByDay = new Map<string, Birthday[]>();
  for (const birthday of birthdays) {
    const key = toDayKey(new Date(birthday.date));
    const list = birthdaysByDay.get(key) ?? [];
    list.push(birthday);
    birthdaysByDay.set(key, list);
  }

  const colorClassForEvent = (event: CalendarEvent) => {
    const teamIndex = teams.findIndex((team) => team.id === event.team.id);
    return colorMode === "type" ? eventTypeColorClass(event.type) : teamColorClass(teamIndex);
  };

  const rangeLabel = `${weekStart.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
  })} – ${weekEnd.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })}`;
  const weekdayLabels = days.map((day) =>
    day.toLocaleDateString(locale, { weekday: "short", day: "2-digit" }),
  );

  const hours = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => HOUR_START + i);
  const columnRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Clic dans la grille horaire : détermine le jour (colonne) et l'heure
  // approchée (position Y, arrondie au quart d'heure) pour ouvrir le
  // dialogue de création à ce moment précis. Pas de sélection par glisser
  // ici (simplification documentée, docs/roadmap.md étape B6, corrections
  // post-revue) : le glisser multi-jours reste disponible en vue Mensuelle.
  const handleColumnClick = (day: Date, event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    const rawHour = HOUR_START + offsetY / HOUR_HEIGHT_PX;
    const roundedQuarterHour = Math.round(rawHour * 4) / 4;
    const clamped = Math.min(Math.max(roundedQuarterHour, HOUR_START), HOUR_END);
    const clicked = new Date(day);
    clicked.setHours(Math.floor(clamped), Math.round((clamped % 1) * 60), 0, 0);
    onSelectRange(clicked, clicked);
  };

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("previousWeek")}
            onClick={() => onWeekChange(addDays(weekStart, -7))}
          >
            <ChevronLeft />
          </Button>
          <span className="text-sm font-medium capitalize">{rangeLabel}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("nextWeek")}
            onClick={() => onWeekChange(addDays(weekStart, 7))}
          >
            <ChevronRight />
          </Button>
        </div>

        {hasError && <p className="text-sm text-destructive">{t("loadFailed")}</p>}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
          {/* En-tête des jours */}
          <div className="grid shrink-0 grid-cols-[3.5rem_repeat(7,1fr)] gap-px bg-border text-center text-xs text-muted-foreground">
            <div className="bg-card" />
            {weekdayLabels.map((label, index) => (
              <div key={index} className="bg-card py-1 capitalize">
                {label}
              </div>
            ))}
          </div>

          {/* Bandeau des événements multi-jours (ex. absences, vacances) */}
          {multiDayEvents.length > 0 && (
            <div className="grid shrink-0 grid-cols-[3.5rem_repeat(7,1fr)] gap-px border-b bg-border">
              <div className="bg-card" />
              <div className="col-span-7 grid grid-cols-7 gap-px bg-card p-1">
                {multiDayEvents.map((event) => {
                  const startIndex = days.findIndex((day) => isSameDay(day, new Date(event.startAt)));
                  const endIndex = days.findIndex((day) => isSameDay(day, new Date(event.endAt!)));
                  const colStart = startIndex === -1 ? 1 : startIndex + 1;
                  const colEnd = (endIndex === -1 ? 6 : endIndex) + 2;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onEditEvent(event)}
                      className={cn(
                        "truncate rounded px-1.5 py-0.5 text-left text-xs text-white",
                        colorClassForEvent(event),
                      )}
                      style={{ gridColumnStart: colStart, gridColumnEnd: colEnd }}
                    >
                      {event.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bandeau des anniversaires — non cliquable, non éditable (voir
              docs/modules/calendrier-evenements.md §Anniversaires) */}
          {birthdays.length > 0 && (
            <div className="grid shrink-0 grid-cols-[3.5rem_repeat(7,1fr)] gap-px border-b bg-border">
              <div className="bg-card" />
              {days.map((day) => {
                const dayBirthdays = birthdaysByDay.get(toDayKey(day)) ?? [];
                return (
                  <div key={toDayKey(day)} className="flex flex-col gap-0.5 bg-card p-1">
                    {dayBirthdays.map((birthday) => (
                      <div
                        key={birthday.memberId}
                        className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] text-muted-foreground"
                      >
                        <Cake className="size-3 shrink-0" />
                        <span className="truncate">
                          {t("birthdayAge", {
                            firstName: birthday.firstName,
                            lastName: birthday.lastName,
                            age: birthday.age,
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* Grille horaire */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div
              className="relative grid grid-cols-[3.5rem_repeat(7,1fr)]"
              style={{ height: TOTAL_HOURS * HOUR_HEIGHT_PX }}
            >
              <div className="relative">
                {hours.map((hour) => (
                  <span
                    key={hour}
                    className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground"
                    style={{ top: (hour - HOUR_START) * HOUR_HEIGHT_PX }}
                  >
                    {String(hour).padStart(2, "0")}h
                  </span>
                ))}
              </div>
              {days.map((day) => {
                const key = toDayKey(day);
                const dayEvents = timedEventsByDay.get(key) ?? [];
                const lanes = assignLanes(dayEvents);
                return (
                  <div
                    key={key}
                    ref={(el) => {
                      if (el) columnRefs.current.set(key, el);
                    }}
                    data-testid={`calendar-week-column-${key}`}
                    onClick={(clickEvent) => handleColumnClick(day, clickEvent)}
                    className="relative border-l"
                  >
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        className="absolute inset-x-0 border-t"
                        style={{ top: (hour - HOUR_START) * HOUR_HEIGHT_PX }}
                      />
                    ))}
                    {dayEvents.map((event) => {
                      const placement = lanes.get(event.id) ?? { lane: 0, laneCount: 1 };
                      const start = timeToHourFraction(event.startAt);
                      const end = effectiveEndFraction(event);
                      const top = (start - HOUR_START) * HOUR_HEIGHT_PX;
                      const height = Math.max((end - start) * HOUR_HEIGHT_PX, 18);
                      const widthPercent = 100 / placement.laneCount;
                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            onEditEvent(event);
                          }}
                          className={cn(
                            "absolute overflow-hidden rounded px-1 py-0.5 text-left text-[11px] text-white",
                            colorClassForEvent(event),
                          )}
                          style={{
                            top,
                            height,
                            left: `${placement.lane * widthPercent}%`,
                            width: `calc(${widthPercent}% - 2px)`,
                          }}
                        >
                          <span className="block truncate font-medium">{event.title}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
