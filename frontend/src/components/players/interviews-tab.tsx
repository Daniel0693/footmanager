"use client";

import {
  CalendarDays,
  Lock,
  MessageSquareQuote,
  Pencil,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
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
import { InterviewFormDialog } from "@/components/players/interview-form-dialog";

interface Interview {
  id: number;
  date: string;
  subject: string;
  summary: string;
  staffFeedback: string | null;
  // Absent de la réponse pour un Player (scope OWN) — jamais un simple null,
  // voir PlayerInterviewsService.findAllByPlayer.
  staffAssessment?: string | null;
  playerFeedback: string | null;
  staff: { firstName: string; lastName: string } | null;
}

type SortOrder = "asc" | "desc";

function toQueryString(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val) search.set(key, val);
  }
  return search.toString();
}

export function InterviewsTab({
  clubId,
  teamId,
  playerId,
}: {
  clubId: string;
  teamId: string;
  playerId: string;
}) {
  const t = useTranslations("interviews");
  const locale = useLocale();
  const { accessToken } = useAuth();

  // Filtres/tri toujours résolus côté backend (décision du 2026-07-06,
  // réappliquée depuis l'onglet Mesures — docs/modules/effectif-joueurs.md).
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const [interviews, setInterviews] = useState<Interview[] | null>(null);
  const [hasError, setHasError] = useState(false);

  const fetchInterviews = useCallback(async () => {
    const query = toQueryString({
      teamId,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      sortOrder,
    });
    const response = await apiFetch(
      `/clubs/${clubId}/players/${playerId}/interviews?${query}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) throw new Error();
    return response.json();
  }, [clubId, playerId, teamId, dateFrom, dateTo, sortOrder, accessToken]);

  const load = useCallback(async () => {
    try {
      const data = await fetchInterviews();
      setInterviews(data);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [fetchInterviews, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchInterviews();
        if (!cancelled) {
          setInterviews(data);
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
  }, [fetchInterviews, t]);

  const handleDelete = async (id: number) => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/players/${playerId}/interviews/${id}?teamId=${teamId}`,
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

  // Comparaison en chaîne (AAAA-MM-JJ) : le champ backend est un `@db.Date`
  // (minuit UTC), donc une comparaison lexicale suffit et évite les pièges de
  // fuseau horaire d'une comparaison de `Date` avec l'heure courante.
  const todayStr = new Date().toISOString().slice(0, 10);
  const isFuture = (interview: Interview) => interview.date.slice(0, 10) > todayStr;

  return (
    <div className="flex flex-col gap-4">
      {/* Filtres (backend) + ajout */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interview-filter-from">{t("dateFrom")}</Label>
            <Input
              id="interview-filter-from"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interview-filter-to">{t("dateTo")}</Label>
            <Input
              id="interview-filter-to"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("sortOrder")}</Label>
            <Select
              value={sortOrder}
              onValueChange={(v) => setSortOrder((v as SortOrder) ?? "desc")}
            >
              <SelectTrigger className="w-48">
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
          <div className="ml-auto">
            <InterviewFormDialog
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
        </CardContent>
      </Card>

      {/* Timeline */}
      {hasError ? (
        <p className="text-sm text-destructive">{t("loadFailed")}</p>
      ) : interviews === null ? null : interviews.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            {t("empty")}
          </CardContent>
        </Card>
      ) : (
        <ol className="flex flex-col gap-5 border-l-2 border-border pl-6">
          {interviews.map((interview) => (
            <li key={interview.id} className="relative">
              <span className="absolute top-1.5 -left-[29px] size-3 rounded-full border-2 border-background bg-primary" />
              <Card>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarDays className="size-3.5" />
                        {formatDate(interview.date)}
                      </span>
                      <h3 className="flex items-center gap-2 text-sm font-semibold">
                        {interview.subject}
                        {isFuture(interview) && (
                          <Badge variant="secondary">{t("scheduled")}</Badge>
                        )}
                      </h3>
                    </div>
                    <div className="flex gap-1">
                      <InterviewFormDialog
                        clubId={clubId}
                        teamId={teamId}
                        playerId={playerId}
                        interview={interview}
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
                        onClick={() => handleDelete(interview.id)}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <p className="text-sm whitespace-pre-wrap">{interview.summary}</p>

                  {interview.staffFeedback && (
                    <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                      <MessageSquareQuote className="size-4 shrink-0 text-muted-foreground" />
                      <div className="flex flex-col gap-0.5">
                        <p className="text-xs font-medium text-muted-foreground">
                          {t("staffFeedback")}
                        </p>
                        <p className="whitespace-pre-wrap">{interview.staffFeedback}</p>
                      </div>
                    </div>
                  )}

                  {interview.playerFeedback && (
                    <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                      <UserRound className="size-4 shrink-0 text-muted-foreground" />
                      <div className="flex flex-col gap-0.5">
                        <p className="text-xs font-medium text-muted-foreground">
                          {t("playerFeedback")}
                        </p>
                        <p className="whitespace-pre-wrap">{interview.playerFeedback}</p>
                      </div>
                    </div>
                  )}

                  {interview.staffAssessment && (
                    <div className="flex items-start gap-2 rounded-lg border border-dashed border-border p-3 text-sm">
                      <Lock className="size-4 shrink-0 text-muted-foreground" />
                      <div className="flex flex-col gap-0.5">
                        <p className="text-xs font-medium text-muted-foreground">
                          {t("staffAssessment")} · {t("staffAssessmentHint")}
                        </p>
                        <p className="whitespace-pre-wrap">{interview.staffAssessment}</p>
                      </div>
                    </div>
                  )}

                  {interview.staff && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <UserRound className="size-3.5" />
                      {t("conductedBy")} {interview.staff.firstName} {interview.staff.lastName}
                    </span>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
