"use client";

import { CalendarCheck, CalendarClock, Lock, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import {
  OBJECTIVE_STATUSES,
  OBJECTIVE_THEMES,
  type ObjectiveHorizon,
  type ObjectiveStatus,
  type ObjectiveTheme,
} from "@/lib/objective";
import type { NoteVisibility } from "@/lib/note-visibility";
import { ObjectiveFormDialog } from "@/components/players/objective-form-dialog";

interface Objective {
  id: number;
  theme: ObjectiveTheme;
  description: string;
  horizon: ObjectiveHorizon;
  status: ObjectiveStatus;
  visibility: NoteVisibility;
  startDate: string | null;
  dueDate: string | null;
  completedDate: string | null;
  assignedBy: { firstName: string; lastName: string } | null;
}

type SortOrder = "asc" | "desc";

const ALL = "ALL";

const STATUS_BADGE_VARIANT: Record<ObjectiveStatus, "outline" | "secondary" | "default" | "destructive"> = {
  PLANNED: "outline",
  IN_PROGRESS: "secondary",
  ACHIEVED: "default",
  FAILED: "destructive",
};

function toQueryString(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val) search.set(key, val);
  }
  return search.toString();
}

export function ObjectivesTab({
  clubId,
  teamId,
  playerId,
  isOwnProfile,
}: {
  clubId: string;
  teamId: string;
  playerId: string;
  // Un joueur consultant sa propre fiche n'a que READ/OWN sur les objectifs
  // (voir backend/prisma/seed.ts, rôle Player) — jamais CREATE/UPDATE/
  // DELETE : masque l'ajout et les actions par ligne plutôt que de les
  // laisser mener à un 403 au clic.
  isOwnProfile: boolean;
}) {
  const t = useTranslations("objectives");
  const locale = useLocale();
  const { accessToken } = useAuth();

  // Filtres/tri toujours résolus côté backend (décision du 2026-07-06,
  // réappliquée depuis les onglets Mesures/Entretien/Notes).
  const [statusFilter, setStatusFilter] = useState<ObjectiveStatus | typeof ALL>(ALL);
  const [themeFilter, setThemeFilter] = useState<ObjectiveTheme | typeof ALL>(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const [objectives, setObjectives] = useState<Objective[] | null>(null);
  const [hasError, setHasError] = useState(false);

  const fetchObjectives = useCallback(async () => {
    const query = toQueryString({
      teamId,
      status: statusFilter === ALL ? undefined : statusFilter,
      theme: themeFilter === ALL ? undefined : themeFilter,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      sortOrder,
    });
    const response = await apiFetch(
      `/clubs/${clubId}/players/${playerId}/objectives?${query}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) throw new Error();
    return response.json();
  }, [
    clubId,
    playerId,
    teamId,
    statusFilter,
    themeFilter,
    dateFrom,
    dateTo,
    sortOrder,
    accessToken,
  ]);

  const load = useCallback(async () => {
    try {
      const data = await fetchObjectives();
      setObjectives(data);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [fetchObjectives, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchObjectives();
        if (!cancelled) {
          setObjectives(data);
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
  }, [fetchObjectives, t]);

  const handleDelete = async (id: number) => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/players/${playerId}/objectives/${id}?teamId=${teamId}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok) throw new Error();
      await load();
    } catch {
      toast.error(t("deleteFailed"));
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

  return (
    <div className="flex flex-col gap-4 lg:h-full lg:min-h-0">
      {/* Filtres (backend) + ajout */}
      <Card className="shrink-0">
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("statusFilter")}</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter((v as ObjectiveStatus | typeof ALL) ?? ALL)}
              >
                <SelectTrigger className="w-36">
                  <SelectValue>
                    {(v: string | null) => (v && v !== ALL ? t(`status${v}`) : t("allStatuses"))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("allStatuses")}</SelectItem>
                  {OBJECTIVE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {t(`status${status}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("themeFilter")}</Label>
              <Select
                value={themeFilter}
                onValueChange={(v) => setThemeFilter((v as ObjectiveTheme | typeof ALL) ?? ALL)}
              >
                <SelectTrigger className="w-36">
                  <SelectValue>
                    {(v: string | null) => (v && v !== ALL ? t(`theme${v}`) : t("allThemes"))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("allThemes")}</SelectItem>
                  {OBJECTIVE_THEMES.map((theme) => (
                    <SelectItem key={theme} value={theme}>
                      {t(`theme${theme}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("sortOrder")}</Label>
              <Select
                value={sortOrder}
                onValueChange={(v) => setSortOrder((v as SortOrder) ?? "desc")}
              >
                <SelectTrigger className="w-36">
                  <SelectValue>
                    {(v: string | null) => (v === "asc" ? t("sortAsc") : t("sortDesc"))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">{t("sortDesc")}</SelectItem>
                  <SelectItem value="asc">{t("sortAsc")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Plage de dates groupée en un seul bloc : les deux champs
                wrappent ensemble plutôt que de se retrouver séparés sur deux
                lignes (retour du 2026-07-06). */}
            <div className="flex flex-col gap-1.5">
              <Label>{t("dateRangeLabel")}</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  aria-label={t("dateFrom")}
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="w-36"
                />
                <span className="text-xs text-muted-foreground">–</span>
                <Input
                  type="date"
                  aria-label={t("dateTo")}
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="w-36"
                />
              </div>
            </div>
          </div>
          {!isOwnProfile && (
            <div className="flex justify-end">
              <ObjectiveFormDialog
                clubId={clubId}
                teamId={teamId}
                playerId={playerId}
                onSuccess={load}
                trigger={
                  <Button>
                    <Plus />
                    {t("add")}
                  </Button>
                }
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timeline : seule cette zone défile (flex-1 min-h-0 overflow-y-auto),
          la carte de filtres au-dessus reste fixe à l'écran. */}
      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {hasError ? (
          <p className="text-sm text-destructive">{t("loadFailed")}</p>
        ) : objectives === null ? null : objectives.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              {t("empty")}
            </CardContent>
          </Card>
        ) : (
          <ol className="flex flex-col gap-5 border-l-2 border-border pl-6">
            {objectives.map((objective) => (
              <li key={objective.id} className="relative">
                <span className="absolute top-1.5 -left-[29px] size-3 rounded-full border-2 border-background bg-primary" />
                <Card>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={STATUS_BADGE_VARIANT[objective.status]}>
                          {t(`status${objective.status}`)}
                        </Badge>
                        <Badge variant="outline">{t(`theme${objective.theme}`)}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {t(`horizon${objective.horizon}`)}
                        </span>
                        {objective.visibility === "PRIVE" && (
                          <Badge variant="outline">
                            <Lock />
                            {t("visibilityPRIVE")}
                          </Badge>
                        )}
                      </div>
                      {!isOwnProfile && (
                        <div className="flex gap-1">
                          <ObjectiveFormDialog
                            clubId={clubId}
                            teamId={teamId}
                            playerId={playerId}
                            objective={objective}
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
                            onClick={() => handleDelete(objective.id)}
                          >
                            <Trash2 className="text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>

                    <p className="text-sm whitespace-pre-wrap">{objective.description}</p>

                    {(objective.startDate || objective.dueDate || objective.completedDate) && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {objective.startDate && (
                          <span className="flex items-center gap-1.5">
                            <CalendarClock className="size-3.5" />
                            {t("startDate")} : {formatDate(objective.startDate)}
                          </span>
                        )}
                        {objective.dueDate && (
                          <span className="flex items-center gap-1.5">
                            <CalendarClock className="size-3.5" />
                            {t("dueDate")} : {formatDate(objective.dueDate)}
                          </span>
                        )}
                        {objective.completedDate && (
                          <span className="flex items-center gap-1.5">
                            <CalendarCheck className="size-3.5" />
                            {t("completedDate")} : {formatDate(objective.completedDate)}
                          </span>
                        )}
                      </div>
                    )}

                    {objective.assignedBy && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <UserRound className="size-3.5" />
                        {t("authorLabel")} {objective.assignedBy.firstName}{" "}
                        {objective.assignedBy.lastName}
                      </span>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
