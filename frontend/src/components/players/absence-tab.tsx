"use client";

import { CalendarRange, Pencil, ShieldCheck, ShieldX, Trash2, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import {
  AbsenceFormDialog,
  reasonLabelKey,
  type ExistingAbsence,
} from "@/components/players/absence-form-dialog";
import { apiFetch, authHeaders } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/date-format";
import { toQueryString } from "@/lib/query-string";

interface Absence extends ExistingAbsence {
  reportedBy: { firstName: string; lastName: string } | null;
}

type SortOrder = "asc" | "desc";

export function AbsenceTab({
  clubId,
  teamId,
  playerId,
  isOwnProfile,
}: {
  clubId: string;
  teamId: string;
  playerId: string;
  // Un joueur qui consulte sa propre fiche peut déclarer une absence (scope
  // OWN, permission CREATE uniquement) mais ne peut ni la modifier ni la
  // supprimer ensuite (pas de UPDATE/DELETE en scope OWN) — masque les
  // actions d'édition et le champ "Excusé" du formulaire de création,
  // laissé à l'entraîneur.
  isOwnProfile: boolean;
}) {
  const t = useTranslations("absences");
  const { accessToken } = useAuth();

  // Filtres/tri toujours résolus côté backend (décision du 2026-07-06,
  // réappliquée depuis les onglets Mesures/Entretien/Notes/Objectifs).
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const [absences, setAbsences] = useState<Absence[] | null>(null);
  const [hasError, setHasError] = useState(false);

  const fetchAbsences = useCallback(async () => {
    const query = toQueryString({
      teamId,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      sortOrder,
    });
    const response = await apiFetch(`/clubs/${clubId}/players/${playerId}/absences?${query}`, {
      headers: authHeaders(accessToken),
    });
    if (!response.ok) throw new Error();
    return response.json();
  }, [clubId, playerId, teamId, dateFrom, dateTo, sortOrder, accessToken]);

  const load = useCallback(async () => {
    try {
      const data = await fetchAbsences();
      setAbsences(data);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [fetchAbsences, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchAbsences();
        if (!cancelled) {
          setAbsences(data);
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
  }, [fetchAbsences, t]);

  const handleDelete = async (id: number) => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/players/${playerId}/absences/${id}?teamId=${teamId}`,
        { method: "DELETE", headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error();
      await load();
    } catch {
      toast.error(t("deleteFailed"));
    }
  };

  return (
    <div className="flex flex-col gap-4 lg:h-full lg:min-h-0">
      {/* Filtres (backend) + ajout */}
      <Card className="shrink-0">
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
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
          <div className="flex justify-end">
            <AbsenceFormDialog
              clubId={clubId}
              teamId={teamId}
              playerId={playerId}
              onSuccess={load}
              canSetExcused={!isOwnProfile}
              trigger={
                <Button>
                  <CalendarRange />
                  {t("add")}
                </Button>
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Timeline : seule cette zone défile (flex-1 min-h-0 overflow-y-auto),
          la carte de filtres au-dessus reste fixe à l'écran. */}
      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {hasError ? (
          <p className="text-sm text-destructive">{t("loadFailed")}</p>
        ) : absences === null ? null : absences.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">{t("empty")}</CardContent>
          </Card>
        ) : (
          <ol className="flex flex-col gap-5 border-l-2 border-border pl-6">
            {absences.map((absence) => (
              <li key={absence.id} className="relative">
                <span className="absolute top-1.5 -left-[29px] size-3 rounded-full border-2 border-background bg-primary" />
                <Card>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1.5 text-sm">
                          <CalendarRange className="size-3.5 text-muted-foreground" />
                          {formatDate(absence.startDate)} – {formatDate(absence.endDate)}
                        </span>
                        {absence.isExcused === true && (
                          <Badge variant="outline">
                            <ShieldCheck />
                            {t("isExcusedTrue")}
                          </Badge>
                        )}
                        {absence.isExcused === false && (
                          <Badge variant="outline">
                            <ShieldX />
                            {t("isExcusedFalse")}
                          </Badge>
                        )}
                      </div>
                      {/* Un joueur n'a pas UPDATE/DELETE sur ses propres
                          absences (seule la déclaration initiale, scope OWN
                          CREATE) — actions masquées plutôt que menant à un
                          403 au clic. */}
                      {!isOwnProfile && (
                        <div className="flex gap-1">
                          <AbsenceFormDialog
                            clubId={clubId}
                            teamId={teamId}
                            playerId={playerId}
                            absence={absence}
                            onSuccess={load}
                            trigger={
                              <Button variant="ghost" size="icon" aria-label={t("edit")}>
                                <Pencil />
                              </Button>
                            }
                          />
                          <AlertDialog>
                            <AlertDialogTrigger
                              render={
                                <Button variant="ghost" size="icon" aria-label={t("delete")}>
                                  <Trash2 className="text-destructive" />
                                </Button>
                              }
                            />
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("deleteDialogDescription")}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogClose
                                  render={<Button variant="outline">{t("cancel")}</Button>}
                                />
                                <AlertDialogClose
                                  render={
                                    <Button
                                      variant="destructive"
                                      onClick={() => void handleDelete(absence.id)}
                                    >
                                      {t("deleteConfirm")}
                                    </Button>
                                  }
                                />
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </div>

                    <p className="text-sm font-medium">{t(reasonLabelKey(absence.reason))}</p>
                    {absence.description && (
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                        {absence.description}
                      </p>
                    )}

                    {absence.reportedBy && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <UserRound className="size-3.5" />
                        {t("authorLabel")} {absence.reportedBy.firstName}{" "}
                        {absence.reportedBy.lastName}
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
