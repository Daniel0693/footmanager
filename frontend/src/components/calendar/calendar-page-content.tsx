"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarListView } from "@/components/calendar/calendar-list-view";
import { CalendarMonthView } from "@/components/calendar/calendar-month-view";
import { CalendarWeekView } from "@/components/calendar/calendar-week-view";
import {
  EventFormDialog,
  type EventFormTeam,
  type ExistingEvent,
} from "@/components/calendar/event-form-dialog";
import { usePathname, useRouter } from "@/i18n/navigation";
import { apiFetch, authHeaders } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { eventTypeCheckboxColorClass, teamCheckboxColorClass } from "@/lib/calendar-color";
import { isSameDay } from "@/lib/calendar-grid";
import { EVENT_TYPES, type EventType } from "@/lib/event";

type CalendarEvent = ExistingEvent;
type CalendarView = "list" | "month" | "week";

type GridDialogState =
  | { open: false }
  | { open: true; mode: "create"; start: Date; end?: Date }
  | { open: true; mode: "edit"; event: CalendarEvent };

function parseViewParam(value: string | null): CalendarView {
  return value === "month" || value === "week" ? value : "list";
}

// "AAAA-MM-JJ" → Date locale à minuit, jamais new Date(value) seul (parse en
// UTC, peut décaler d'un jour selon le fuseau — même piège documenté dans
// event-form-dialog.tsx parseDateInputValue).
function parseDateParam(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateParam(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function CalendarPageContent({ clubId }: { clubId: string }) {
  const t = useTranslations("calendar");
  const { accessToken } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [teams, setTeams] = useState<EventFormTeam[] | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<Set<EventType>>(
    () => new Set(EVENT_TYPES),
  );
  // null tant que "mes équipes" n'a pas encore répondu : le calendrier ne
  // doit pas se charger avant d'avoir un premier jeu d'équipes accessibles.
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<number> | null>(null);
  const [showBirthdays, setShowBirthdays] = useState(true);

  // Persistance entre navigations (docs/roadmap.md étape B7) : vue active et
  // position affichée (mois/semaine) encodées dans l'URL — un rechargement
  // de page ou un lien partagé retombe sur la même vue, pas sur la Liste
  // recentrée sur aujourd'hui. Lu une seule fois au montage (initialiseur
  // paresseux) : la synchronisation retour se fait dans l'effet ci-dessous,
  // pas par une re-lecture continue de l'URL.
  const [view, setView] = useState<CalendarView>(() =>
    parseViewParam(searchParams.get("view")),
  );
  const [month, setMonth] = useState(
    () => parseDateParam(searchParams.get("month")) ?? new Date(),
  );
  const [week, setWeek] = useState(() => parseDateParam(searchParams.get("week")) ?? new Date());

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("view", view);
    params.set("month", toDateParam(month));
    params.set("week", toDateParam(week));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, month, week]);

  // Vue par défaut selon le format d'écran (retour utilisateur 2026-07-13) :
  // Mensuelle sur ordinateur, Liste sur portable — seulement quand l'URL ne
  // précise aucune vue explicite (un lien partagé avec ?view=week doit
  // toujours être respecté). `window` est indisponible au rendu serveur,
  // donc corrigé après montage plutôt que dans l'initialiseur de `view`
  // ci-dessus — un bref flash Liste→Mois au premier chargement desktop est
  // accepté (pas de détection de user-agent côté serveur ici).
  const autoViewAppliedRef = useRef(false);
  useEffect(() => {
    if (autoViewAppliedRef.current) return;
    autoViewAppliedRef.current = true;
    if (searchParams.get("view") !== null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.matchMedia("(min-width: 768px)").matches) setView("month");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Incrémenté après toute création/édition/suppression pour que la vue
  // active (Liste/Mois/Semaine) sache qu'elle doit recharger sa fenêtre —
  // chaque vue gère son propre chargement borné à sa plage affichée (voir
  // lib/calendar-events-api.ts), plus de liste globale non bornée ici.
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = () => setRefreshKey((key) => key + 1);
  // Bouton "Aujourd'hui" : recentre la vue active. Mois/Semaine se
  // recentrent directement via leur état de navigation ; la vue Liste n'a
  // pas d'état de navigation équivalent, elle écoute recenterKey pour
  // abandonner sa fenêtre de scroll actuelle et revenir à la fenêtre
  // initiale centrée sur aujourd'hui (voir CalendarListView).
  const [recenterKey, setRecenterKey] = useState(0);
  const goToToday = () => {
    const today = new Date();
    if (view === "month") setMonth(today);
    else if (view === "week") setWeek(today);
    else setRecenterKey((key) => key + 1);
  };

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
        headers: authHeaders(accessToken),
      });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as { data: EventFormTeam[] };
      setTeams(body.data);
      setSelectedTeamIds(new Set(body.data.map((team) => team.id)));
    } catch {
      toast.error(t("teamsLoadFailed"));
    }
  }, [clubId, accessToken, t]);

  useEffect(() => {
    // Bootstrap volontaire : charge les équipes accessibles au montage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTeams();
  }, [loadTeams]);

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

  // Un match ne s'édite pas via ce dialogue générique (voir CalendarListView
  // pour la même règle en vue Liste) — navigue vers la fiche match dédiée
  // (B3, docs/modules/matchs.md) plutôt que d'ouvrir le dialogue générique.
  const handleEditFromGrid = (event: CalendarEvent) => {
    if (event.type === "MATCH") {
      if (event.match) {
        router.push(`/clubs/${clubId}/teams/${event.team.id}/matches/${event.match.id}`);
      }
      return;
    }
    setGridDialog({ open: true, mode: "edit", event });
  };

  // Mémoïsé (correctif 2026-07-10) : un objet littéral recréé à chaque
  // rendu de CalendarPageContent (pour n'importe quelle raison — ouverture
  // d'un dialogue, etc.) changeait de référence sans que son contenu change
  // réellement, ce qui redéclenchait à tort l'effet de chargement principal
  // de CalendarListView (filters est dans ses dépendances) : la génération
  // avançait, invalidant silencieusement le résultat d'un loadOlder/
  // loadNewer déclenché par le scroll encore en vol (requête réseau bien
  // partie, mais résultat jeté — voir generationRef dans CalendarListView).
  const filters = useMemo(
    () => ({ types: selectedTypes, teamIds: selectedTeamIds, showBirthdays }),
    [selectedTypes, selectedTeamIds, showBirthdays],
  );

  return (
    <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:flex-row">
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
                  // La couleur des événements ne suit le type que si aucune
                  // couleur par équipe n'est déjà appliquée (colorMode
                  // "team", vue AdminClub) — sinon la case garde son style
                  // par défaut plutôt que de suggérer une correspondance
                  // inexistante (voir lib/calendar-color.ts).
                  className={colorMode === "type" ? eventTypeCheckboxColorClass(type) : undefined}
                />
                {t(`type${type}`)}
              </label>
            ))}
          </div>
          {teams && teams.length > 1 && (
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-muted-foreground">{t("teamFilter")}</Label>
              {teams.map((team, index) => (
                <label key={team.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedTeamIds?.has(team.id) ?? false}
                    onCheckedChange={() => toggleTeam(team.id)}
                    className={teamCheckboxColorClass(index)}
                  />
                  {team.name}
                </label>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">{t("otherFilter")}</Label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={showBirthdays}
                onCheckedChange={() => setShowBirthdays((value) => !value)}
              />
              {t("birthdays")}
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="flex min-w-0 flex-1 flex-col gap-4 lg:min-h-0">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={goToToday}>
              {t("today")}
            </Button>
            <Tabs
              value={view}
              onValueChange={(value) => setView(value as CalendarView)}
            >
              <TabsList>
                <TabsTrigger value="list">{t("viewList")}</TabsTrigger>
                <TabsTrigger value="week">{t("viewWeek")}</TabsTrigger>
                <TabsTrigger value="month">{t("viewMonth")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <EventFormDialog
            clubId={clubId}
            teams={teams ?? []}
            onSuccess={bumpRefresh}
            trigger={
              <Button disabled={!teams || teams.length === 0}>
                <Plus />
                {t("add")}
              </Button>
            }
          />
        </div>

        {view === "month" ? (
          <CalendarMonthView
            clubId={clubId}
            month={month}
            onMonthChange={setMonth}
            teams={teams ?? []}
            filters={filters}
            refreshKey={refreshKey}
            colorMode={colorMode}
            onSelectRange={handleSelectRange}
            onEditEvent={handleEditFromGrid}
          />
        ) : view === "week" ? (
          <CalendarWeekView
            clubId={clubId}
            week={week}
            onWeekChange={setWeek}
            teams={teams ?? []}
            filters={filters}
            refreshKey={refreshKey}
            colorMode={colorMode}
            onSelectRange={handleSelectRange}
            onEditEvent={handleEditFromGrid}
          />
        ) : (
          <CalendarListView
            clubId={clubId}
            teams={teams ?? []}
            filters={filters}
            refreshKey={refreshKey}
            recenterKey={recenterKey}
            colorMode={colorMode}
          />
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
          bumpRefresh();
        }}
      />
    </div>
  );
}
