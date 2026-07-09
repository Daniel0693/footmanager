"use client";

import { Cake } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { ExistingEvent } from "@/components/calendar/event-form-dialog";
import { eventTypeColorClass, teamColorClass } from "@/lib/calendar-color";
import type { Birthday } from "@/lib/calendar-events-api";
import {
  assignLanes,
  getIsoWeekNumber,
  isMultiDay,
  isSameDay,
  startOfDay,
  toDayKey,
} from "@/lib/calendar-grid";
import { cn } from "@/lib/utils";

type CalendarEvent = ExistingEvent;

// Hauteur réservée en haut de chaque cellule pour le numéro du jour (padding
// p-1 + ligne de texte/pastille "aujourd'hui") : le bandeau superposé
// démarre juste en dessous, jamais par-dessus le numéro (voir DayCell et
// l'overlay de bandeaux ci-dessous — les deux doivent rester synchronisés).
const DAY_NUMBER_AREA_PX = 24;
const BANNER_LANE_HEIGHT_PX = 18;

function chunkWeeks(days: Date[]): Date[][] {
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

// Position (0-6) d'une date dans la semaine affichée, bornée aux limites
// de la semaine — un événement multi-jours démarré/terminé hors de cette
// semaine est donc visuellement tronqué à ses bords (docs/modules/
// calendrier-evenements.md).
function dayIndexInWeek(date: Date, weekStart: Date): number {
  const diff = Math.round(
    (startOfDay(date).getTime() - weekStart.getTime()) / 86_400_000,
  );
  return Math.min(Math.max(diff, 0), 6);
}

function weekOverlapsEvent(event: CalendarEvent, weekStart: Date, weekEnd: Date): boolean {
  const eventStart = startOfDay(new Date(event.startAt));
  const eventEnd = startOfDay(new Date(event.endAt!));
  return eventStart <= weekEnd && eventEnd >= weekStart;
}

// Colonnes de jours discrètes : deux bandeaux qui se touchent sur le même
// jour de bordure se chevauchent visuellement — voie non réutilisable (voir
// assignLanes, lib/calendar-grid.ts), à la différence du chevauchement
// horaire continu de la vue Hebdomadaire.
function assignBannerLanes(weekEvents: CalendarEvent[], weekStart: Date) {
  return assignLanes(weekEvents, {
    id: (event) => event.id,
    start: (event) => dayIndexInWeek(new Date(event.startAt), weekStart),
    end: (event) => dayIndexInWeek(new Date(event.endAt!), weekStart),
    reuseWhenTouching: false,
  });
}

/**
 * Grille de jours de la vue Mensuelle (42 jours, docs/roadmap.md §B5/B6) —
 * remplit toute la hauteur disponible : chaque semaine reçoit une part
 * égale (flex-1), chaque cellule de jour défile individuellement
 * (overflow-y-auto) si elle contient plus d'événements que sa hauteur ne
 * peut en montrer, plutôt que de faire défiler toute la page.
 *
 * Les événements multi-jours (startAt/endAt sur des jours différents) sont
 * extraits de la liste par jour et affichés en bandeau *à l'intérieur* des
 * cellules qu'ils traversent, superposé juste sous le numéro de jour — pas
 * comme une ligne séparée entre deux semaines (correction post-revue,
 * docs/roadmap.md) : chaque cellule réserve un espace (DAY_NUMBER_AREA_PX +
 * voies de bandeaux) que l'overlay vient remplir exactement.
 *
 * Sélection par glisser (docs/modules/calendrier-evenements.md §Création) :
 * mousedown pose le début, mouseenter pendant le drag étend la sélection,
 * mouseup (écouté sur window — le relâchement peut sortir de la grille)
 * finalise la plage et prévient le parent. Un clic simple (mousedown +
 * mouseup sans déplacement) sélectionne un seul jour.
 */
export function CalendarGridDays({
  days,
  events,
  birthdays = [],
  teams,
  colorMode,
  onSelectRange,
  onEditEvent,
  referenceMonth,
}: {
  days: Date[];
  events: CalendarEvent[];
  birthdays?: Birthday[];
  teams: { id: number; name: string }[];
  colorMode: "type" | "team";
  onSelectRange: (start: Date, end: Date) => void;
  onEditEvent: (event: CalendarEvent) => void;
  // Si fourni, grise les jours hors de ce mois.
  referenceMonth?: Date;
}) {
  const locale = useLocale();
  const t = useTranslations("calendar");
  const [dragStart, setDragStart] = useState<Date | null>(null);
  const [dragEnd, setDragEnd] = useState<Date | null>(null);

  useEffect(() => {
    if (!dragStart) return;
    const handleMouseUp = () => {
      if (dragStart && dragEnd) {
        const start = dragStart <= dragEnd ? dragStart : dragEnd;
        const end = dragStart <= dragEnd ? dragEnd : dragStart;
        onSelectRange(start, end);
      }
      setDragStart(null);
      setDragEnd(null);
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragStart, dragEnd]);

  const multiDayEvents = events.filter(isMultiDay);
  const singleDayEventsByDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    if (isMultiDay(event)) continue;
    const key = toDayKey(new Date(event.startAt));
    const list = singleDayEventsByDay.get(key) ?? [];
    list.push(event);
    singleDayEventsByDay.set(key, list);
  }

  const birthdaysByDay = new Map<string, Birthday[]>();
  for (const birthday of birthdays) {
    const key = toDayKey(new Date(birthday.date));
    const list = birthdaysByDay.get(key) ?? [];
    list.push(birthday);
    birthdaysByDay.set(key, list);
  }

  const teamIndexById = new Map(teams.map((team, index) => [team.id, index]));
  const colorClassFor = (event: CalendarEvent) =>
    colorMode === "type"
      ? eventTypeColorClass(event.type)
      : teamColorClass(teamIndexById.get(event.team.id) ?? -1);

  const inDragRange = (day: Date) => {
    if (!dragStart || !dragEnd) return false;
    const start = dragStart <= dragEnd ? dragStart : dragEnd;
    const end = dragStart <= dragEnd ? dragEnd : dragStart;
    return day >= start && day <= end;
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  const today = new Date();
  const weeks = chunkWeeks(days);

  return (
    <div className="flex min-h-0 flex-1 select-none flex-col gap-px overflow-hidden rounded-md border bg-border">
      {weeks.map((week, weekIndex) => {
        const weekStart = week[0];
        const weekEnd = week[6];
        const weekMultiDayEvents = multiDayEvents.filter((event) =>
          weekOverlapsEvent(event, weekStart, weekEnd),
        );
        const lanesById = assignBannerLanes(weekMultiDayEvents, weekStart);
        const laneCount = weekMultiDayEvents.length
          ? [...lanesById.values()][0].laneCount
          : 0;
        return (
          <div
            key={weekIndex}
            data-testid={`calendar-week-block-${weekIndex}`}
            className="flex min-h-0 flex-1 gap-px bg-border"
          >
            <div className="flex w-5 shrink-0 items-start justify-center bg-card pt-1 text-[10px] text-muted-foreground">
              {getIsoWeekNumber(weekStart)}
            </div>
            <div className="relative min-h-0 flex-1">
              <div className="grid h-full min-h-0 grid-cols-7 gap-px bg-border">
                {week.map((day) => {
                  const key = toDayKey(day);
                  const dayEvents = singleDayEventsByDay.get(key) ?? [];
                  const dayBirthdays = birthdaysByDay.get(key) ?? [];
                  const isDimmed = referenceMonth
                    ? day.getMonth() !== referenceMonth.getMonth()
                    : false;
                  return (
                    <div
                      key={key}
                      data-testid={`calendar-day-${key}`}
                      onMouseDown={() => {
                        setDragStart(day);
                        setDragEnd(day);
                      }}
                      onMouseEnter={() => {
                        if (dragStart) setDragEnd(day);
                      }}
                      className={cn(
                        "flex min-h-0 flex-col bg-card p-1 text-xs",
                        isDimmed && "bg-muted/40 text-muted-foreground",
                        inDragRange(day) && "bg-accent",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 shrink-0 items-start justify-end",
                          isSameDay(day, today) &&
                            "size-5 items-center justify-center rounded-full bg-primary text-primary-foreground",
                        )}
                      >
                        {day.getDate()}
                      </span>
                      {laneCount > 0 && (
                        <div
                          className="shrink-0"
                          style={{ height: laneCount * BANNER_LANE_HEIGHT_PX }}
                        />
                      )}
                      <div className="mt-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
                        {dayEvents.map((event) => (
                          <button
                            key={event.id}
                            type="button"
                            onMouseDown={(clickEvent) => clickEvent.stopPropagation()}
                            onClick={(clickEvent) => {
                              clickEvent.stopPropagation();
                              onEditEvent(event);
                            }}
                            className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-left hover:bg-accent"
                          >
                            <span
                              className={cn(
                                "size-2 shrink-0 rounded-full",
                                colorClassFor(event),
                              )}
                            />
                            <span className="shrink-0 text-muted-foreground">
                              {formatTime(event.startAt)}
                            </span>
                            <span className="truncate">{event.title}</span>
                          </button>
                        ))}
                        {dayBirthdays.map((birthday) => (
                          <div
                            key={`birthday-${birthday.memberId}`}
                            className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-muted-foreground"
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
                    </div>
                  );
                })}
              </div>
              {laneCount > 0 && (
                <div
                  className="pointer-events-none absolute inset-0 grid grid-cols-7 gap-px"
                  style={{ paddingTop: DAY_NUMBER_AREA_PX, gridAutoRows: BANNER_LANE_HEIGHT_PX }}
                >
                  {weekMultiDayEvents.map((event) => {
                    const startCol = dayIndexInWeek(new Date(event.startAt), weekStart) + 1;
                    const endCol = dayIndexInWeek(new Date(event.endAt!), weekStart) + 2;
                    const lane = lanesById.get(event.id)?.lane ?? 0;
                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => onEditEvent(event)}
                        className={cn(
                          "pointer-events-auto truncate rounded px-1 text-left text-[10px] leading-4 text-white",
                          colorClassFor(event),
                        )}
                        style={{
                          gridColumnStart: startCol,
                          gridColumnEnd: endCol,
                          gridRow: lane + 1,
                        }}
                      >
                        {event.title}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
