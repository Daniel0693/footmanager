"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarGridDays } from "@/components/calendar/calendar-grid-days";
import type { EventFormTeam, ExistingEvent } from "@/components/calendar/event-form-dialog";
import { useAuth } from "@/lib/auth/auth-context";
import { endOfDay } from "@/lib/calendar-grid";
import {
  fetchCalendarEvents,
  isEmptyFilterSelection,
  isFiltersReady,
  type EventFilters,
} from "@/lib/calendar-events-api";

type CalendarEvent = ExistingEvent;

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
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
  clubId,
  month,
  onMonthChange,
  teams,
  filters,
  refreshKey,
  colorMode,
  onSelectRange,
  onEditEvent,
}: {
  clubId: string;
  month: Date;
  onMonthChange: (month: Date) => void;
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

  const days = buildGridDays(month);
  const gridStart = days[0];
  const gridEnd = days[days.length - 1];

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [hasError, setHasError] = useState(false);

  // Ne charge que les événements de la grille affichée (docs/roadmap.md
  // étape B6, corrections post-revue) — jamais tout l'historique/futur.
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
          dateFrom: gridStart,
          dateTo: endOfDay(gridEnd),
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
  }, [clubId, accessToken, filters, refreshKey, month.getFullYear(), month.getMonth(), t]);

  const monthLabel = month.toLocaleDateString(locale, { month: "long", year: "numeric" });
  const weekdayLabels = days
    .slice(0, 7)
    .map((day) => day.toLocaleDateString(locale, { weekday: "short" }));

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 items-center justify-between">
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

        {hasError && <p className="text-sm text-destructive">{t("loadFailed")}</p>}

        <div className="grid shrink-0 grid-cols-7 gap-px overflow-hidden rounded-md border bg-border text-center text-xs text-muted-foreground">
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
          referenceMonth={month}
        />
      </CardContent>
    </Card>
  );
}
