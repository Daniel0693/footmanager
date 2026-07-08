"use client";

import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import type { ExistingEvent } from "@/components/calendar/event-form-dialog";
import { eventTypeColorClass, teamColorClass } from "@/lib/calendar-color";
import { isSameDay, toDayKey } from "@/lib/calendar-grid";
import { cn } from "@/lib/utils";

type CalendarEvent = ExistingEvent;

/**
 * Grille de jours de la vue Mensuelle (42 jours, docs/roadmap.md §B5/B6) —
 * remplit toute la hauteur disponible (grid-template-rows en fr, pas de
 * hauteur minimale fixe) : chaque cellule défile individuellement
 * (overflow-y-auto) si elle contient plus d'événements que sa hauteur ne
 * peut en montrer, plutôt que de faire défiler toute la page.
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
  teams,
  colorMode,
  onSelectRange,
  onEditEvent,
  referenceMonth,
}: {
  days: Date[];
  events: CalendarEvent[];
  teams: { id: number; name: string }[];
  colorMode: "type" | "team";
  onSelectRange: (start: Date, end: Date) => void;
  onEditEvent: (event: CalendarEvent) => void;
  // Si fourni, grise les jours hors de ce mois.
  referenceMonth?: Date;
}) {
  const locale = useLocale();
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

  const eventsByDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = toDayKey(new Date(event.startAt));
    const list = eventsByDay.get(key) ?? [];
    list.push(event);
    eventsByDay.set(key, list);
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
  const rowCount = days.length / 7;

  return (
    <div
      className="grid min-h-0 flex-1 select-none grid-cols-7 gap-px overflow-hidden rounded-md border bg-border"
      style={{ gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))` }}
    >
      {days.map((day) => {
        const key = toDayKey(day);
        const dayEvents = eventsByDay.get(key) ?? [];
        const isDimmed = referenceMonth ? day.getMonth() !== referenceMonth.getMonth() : false;
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
              "flex min-h-0 flex-col gap-1 bg-card p-1 text-xs",
              isDimmed && "bg-muted/40 text-muted-foreground",
              inDragRange(day) && "bg-accent",
            )}
          >
            <span
              className={cn(
                "shrink-0 self-end",
                isSameDay(day, today) &&
                  "flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground",
              )}
            >
              {day.getDate()}
            </span>
            <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
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
                  <span className={cn("size-2 shrink-0 rounded-full", colorClassFor(event))} />
                  <span className="shrink-0 text-muted-foreground">
                    {formatTime(event.startAt)}
                  </span>
                  <span className="truncate">{event.title}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
