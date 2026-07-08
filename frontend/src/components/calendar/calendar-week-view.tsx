"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarGridDays } from "@/components/calendar/calendar-grid-days";
import type { ExistingEvent } from "@/components/calendar/event-form-dialog";
import { addDays, startOfWeek } from "@/lib/calendar-grid";

type CalendarEvent = ExistingEvent;

// Variante zoomée de la vue Mensuelle (docs/roadmap.md §B6) : mêmes briques
// de grille/interaction (CalendarGridDays), une seule semaine de 7 jours,
// cellules plus hautes puisqu'il n'y a qu'une rangée à afficher.
export function CalendarWeekView({
  week,
  onWeekChange,
  events,
  teams,
  colorMode,
  onSelectRange,
  onEditEvent,
}: {
  week: Date;
  onWeekChange: (week: Date) => void;
  events: CalendarEvent[];
  teams: { id: number; name: string }[];
  colorMode: "type" | "team";
  onSelectRange: (start: Date, end: Date) => void;
  onEditEvent: (event: CalendarEvent) => void;
}) {
  const t = useTranslations("calendar");
  const locale = useLocale();

  const weekStart = startOfWeek(week);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = days[6];

  const rangeLabel = `${weekStart.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
  })} – ${weekEnd.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })}`;
  const weekdayLabels = days.map((day) =>
    day.toLocaleDateString(locale, { weekday: "short", day: "2-digit" }),
  );

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
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

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border text-center text-xs text-muted-foreground">
          {weekdayLabels.map((label, index) => (
            <div key={index} className="bg-card py-1 capitalize">
              {label}
            </div>
          ))}
        </div>

        <CalendarGridDays
          days={days}
          events={events}
          teams={teams}
          colorMode={colorMode}
          onSelectRange={onSelectRange}
          onEditEvent={onEditEvent}
          cellMinHeightClass="min-h-48"
        />
      </CardContent>
    </Card>
  );
}
