"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ExistingEvent } from "@/components/calendar/event-form-dialog";
import { eventTypeColorClass, teamColorClass } from "@/lib/calendar-color";
import { cn } from "@/lib/utils";

type CalendarEvent = ExistingEvent;

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toDayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// Grille de 42 jours (6 semaines) — hauteur constante quel que soit le mois,
// semaine commençant le lundi (convention française).
function buildGridDays(month: Date): Date[] {
  const first = startOfMonth(month);
  const firstWeekday = (first.getDay() + 6) % 7;
  const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - firstWeekday);
  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    return day;
  });
}

export function CalendarMonthView({
  month,
  onMonthChange,
  events,
  teams,
  colorMode,
  onSelectRange,
  onEditEvent,
}: {
  month: Date;
  onMonthChange: (month: Date) => void;
  events: CalendarEvent[];
  teams: { id: number; name: string }[];
  colorMode: "type" | "team";
  onSelectRange: (start: Date, end: Date) => void;
  onEditEvent: (event: CalendarEvent) => void;
}) {
  const t = useTranslations("calendar");
  const locale = useLocale();

  // Sélection par glisser (docs/modules/calendrier-evenements.md §Création) :
  // mousedown pose le début, mouseenter pendant le drag étend la sélection,
  // mouseup (écouté sur window — le relâchement peut sortir de la grille)
  // finalise la plage et prévient le parent.
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

  const days = buildGridDays(month);
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

  const monthLabel = month.toLocaleDateString(locale, { month: "long", year: "numeric" });
  const weekdayLabels = days
    .slice(0, 7)
    .map((day) => day.toLocaleDateString(locale, { weekday: "short" }));
  const today = new Date();

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("previousMonth")}
            onClick={() => onMonthChange(addMonths(month, -1))}
          >
            <ChevronLeft />
          </Button>
          <span className="text-sm font-medium capitalize">{monthLabel}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("nextMonth")}
            onClick={() => onMonthChange(addMonths(month, 1))}
          >
            <ChevronRight />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border text-center text-xs text-muted-foreground">
          {weekdayLabels.map((label, index) => (
            <div key={index} className="bg-card py-1 capitalize">
              {label}
            </div>
          ))}
        </div>

        <div className="grid select-none grid-cols-7 gap-px overflow-hidden rounded-md border bg-border">
          {days.map((day) => {
            const key = toDayKey(day);
            const dayEvents = eventsByDay.get(key) ?? [];
            const isCurrentMonth = day.getMonth() === month.getMonth();
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
                  "flex min-h-24 flex-col gap-1 bg-card p-1 text-xs",
                  !isCurrentMonth && "bg-muted/40 text-muted-foreground",
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
      </CardContent>
    </Card>
  );
}
