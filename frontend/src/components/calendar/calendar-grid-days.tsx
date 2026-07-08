"use client";

import { useEffect, useState } from "react";
import type { ExistingEvent } from "@/components/calendar/event-form-dialog";
import { eventTypeColorClass, teamColorClass } from "@/lib/calendar-color";
import { isSameDay, toDayKey } from "@/lib/calendar-grid";
import { cn } from "@/lib/utils";

type CalendarEvent = ExistingEvent;

/**
 * Grille de jours réutilisée par les vues Mensuelle (B5, 42 jours) et
 * Hebdomadaire (B6, 7 jours) — mêmes briques de code couleur et
 * d'interaction (docs/roadmap.md §B6 "réutilise les briques de B5").
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
  cellMinHeightClass = "min-h-24",
}: {
  days: Date[];
  events: CalendarEvent[];
  teams: { id: number; name: string }[];
  colorMode: "type" | "team";
  onSelectRange: (start: Date, end: Date) => void;
  onEditEvent: (event: CalendarEvent) => void;
  // Si fourni, grise les jours hors de ce mois (vue Mensuelle uniquement —
  // la vue Hebdomadaire n'en a pas besoin, ses 7 jours sont tous "courants").
  referenceMonth?: Date;
  cellMinHeightClass?: string;
}) {
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

  const today = new Date();

  return (
    <div className="grid select-none grid-cols-7 gap-px overflow-hidden rounded-md border bg-border">
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
              "flex flex-col gap-1 bg-card p-1 text-xs",
              cellMinHeightClass,
              isDimmed && "bg-muted/40 text-muted-foreground",
              inDragRange(day) && "bg-accent",
            )}
          >
            <span
              className={cn(
                "self-end",
                isSameDay(day, today) &&
                  "flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground",
              )}
            >
              {day.getDate()}
            </span>
            <div className="flex flex-col gap-0.5">
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
