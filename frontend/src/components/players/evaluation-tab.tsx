"use client";

import { Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { EvaluationFormDialog } from "@/components/players/evaluation-form-dialog";

export interface EvaluationCriterionOption {
  id: number;
  name: string;
  description: string | null;
}

export interface EvaluationAxis {
  id: number;
  categoryId: number;
  name: string;
  displayOrder: number;
  criteria: EvaluationCriterionOption[];
}

interface EvaluationScore {
  id: number;
  criterionId: number;
  score: string;
  criterion: { id: number; name: string; category: { id: number; name: string } };
}

interface Evaluation {
  id: number;
  date: string;
  comments: string | null;
  scores: EvaluationScore[];
  evaluator: { firstName: string; lastName: string } | null;
}

type SortOrder = "asc" | "desc";

// Couleur unique validée (skill dataviz — voir measurements-tab.tsx pour la
// même paire clair/sombre) : un radar à une seule série n'a pas de risque de
// confusion catégorielle, mais on garde la teinte de référence de l'app.
const chartConfig: ChartConfig = {
  score: { label: "", theme: { light: "#2a78d6", dark: "#3987e5" } },
};

function toQueryString(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val) search.set(key, val);
  }
  return search.toString();
}

// Moyenne, pour une session donnée, des scores appartenant à la catégorie de
// cet axe — `undefined` si la session ne contient aucun score de cette
// catégorie (cas résiduel : critère désactivé/ajouté après coup).
function categoryAverage(evaluation: Evaluation, axis: EvaluationAxis): number | undefined {
  const criterionIds = new Set(axis.criteria.map((c) => c.id));
  const matching = evaluation.scores.filter((s) => criterionIds.has(s.criterionId));
  if (matching.length === 0) return undefined;
  return (
    matching.reduce((sum, s) => sum + Number(s.score), 0) / matching.length
  );
}

function computeRadarData(axes: EvaluationAxis[], latestEvaluation: Evaluation | undefined) {
  if (!latestEvaluation) return [];
  return axes
    .map((axis) => {
      const average = categoryAverage(latestEvaluation, axis);
      if (average === undefined) return null;
      return { axis: axis.name, score: Math.round(average * 10) / 10 };
    })
    .filter((point): point is { axis: string; score: number } => point !== null);
}

export function EvaluationTab({
  clubId,
  teamId,
  playerId,
  isOwnProfile,
}: {
  clubId: string;
  teamId: string;
  playerId: string;
  // Un joueur consultant sa propre fiche n'a que READ/OWN sur les
  // évaluations (voir backend/prisma/seed.ts, rôle Player) — jamais
  // CREATE/UPDATE/DELETE : masque l'ajout et les actions par ligne plutôt
  // que de les laisser mener à un 403 au clic.
  isOwnProfile: boolean;
}) {
  const t = useTranslations("evaluations");
  const locale = useLocale();
  const { accessToken } = useAuth();

  const [axes, setAxes] = useState<EvaluationAxis[] | null>(null);
  const [configHasError, setConfigHasError] = useState(false);

  // Filtres/tri toujours résolus côté backend (décision du 2026-07-06,
  // réappliquée depuis les onglets Mesures/Entretien/Notes/Objectifs).
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const [evaluations, setEvaluations] = useState<Evaluation[] | null>(null);
  const [hasError, setHasError] = useState(false);

  const fetchEvaluations = useCallback(
    async (params: Record<string, string | undefined>) => {
      const query = toQueryString({ teamId, ...params });
      const response = await apiFetch(
        `/clubs/${clubId}/players/${playerId}/evaluations?${query}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok) throw new Error();
      return response.json();
    },
    [clubId, playerId, teamId, accessToken],
  );

  const load = useCallback(async () => {
    try {
      const data = await fetchEvaluations({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sortOrder,
      });
      setEvaluations(data);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [fetchEvaluations, dateFrom, dateTo, sortOrder, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await apiFetch(
          `/clubs/${clubId}/evaluation-config?teamId=${teamId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!cancelled) {
          setAxes(data);
          setConfigHasError(false);
        }
      } catch {
        if (!cancelled) {
          setConfigHasError(true);
          toast.error(t("configLoadFailed"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clubId, teamId, accessToken, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchEvaluations({
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          sortOrder,
        });
        if (!cancelled) {
          setEvaluations(data);
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
  }, [fetchEvaluations, dateFrom, dateTo, sortOrder, t]);

  const handleDelete = async (id: number) => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/players/${playerId}/evaluations/${id}?teamId=${teamId}`,
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

  // Le radar affiche toujours la session la plus récente au global (pas
  // celle du haut de la liste filtrée/triée par l'utilisateur) : on la
  // dérive donc séparément, triée par date décroissante indépendamment de
  // `sortOrder`.
  const latestEvaluation = useMemo(() => {
    if (!evaluations || evaluations.length === 0) return undefined;
    return [...evaluations].sort((a, b) => b.date.localeCompare(a.date))[0];
  }, [evaluations]);

  const radarData = useMemo(
    () => (axes ? computeRadarData(axes, latestEvaluation) : []),
    [axes, latestEvaluation],
  );

  return (
    <div className="flex flex-col gap-4 lg:h-full lg:min-h-0">
      {/* 1. Filtres + ajout (colonne 1) et radar dynamique (colonne 2) côte à
          côte : évite qu'un graphique pleine largeur ne devienne trop haut
          et n'impose un scroll dès l'arrivée sur l'onglet. La colonne 1
          s'étire (items-stretch) sur la hauteur du radar plutôt que de
          laisser un grand vide sous le bouton "Ajouter" (bouton ancré en
          bas via justify-between). Reste fixe (shrink-0) : seul le tableau
          d'historique défile en dessous. */}
      <div className="grid shrink-0 grid-cols-1 items-stretch gap-4 lg:grid-cols-[20rem_1fr]">
        <Card>
          <CardContent className="flex h-full flex-col justify-between gap-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>{t("sortOrder")}</Label>
                <Select
                  value={sortOrder}
                  onValueChange={(v) => setSortOrder((v as SortOrder) ?? "desc")}
                >
                  <SelectTrigger className="w-full">
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
                    className="w-0 min-w-0 flex-1"
                  />
                  <span className="text-xs text-muted-foreground">–</span>
                  <Input
                    type="date"
                    aria-label={t("dateTo")}
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                    className="w-0 min-w-0 flex-1"
                  />
                </div>
              </div>
            </div>
            {!isOwnProfile && axes && axes.length > 0 && (
              <div className="flex justify-end">
                <EvaluationFormDialog
                  clubId={clubId}
                  teamId={teamId}
                  playerId={playerId}
                  axes={axes}
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

        {/* Radar dynamique — axes = catégories activées pour ce club,
            valeurs = moyennes par catégorie de la dernière évaluation */}
        <Card>
          <CardContent>
            {configHasError ? (
              <p className="text-sm text-destructive">{t("configLoadFailed")}</p>
            ) : axes === null || evaluations === null ? null : radarData.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("radarEmpty")}</p>
            ) : (
              <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-96">
                <RadarChart
                  data={radarData}
                  outerRadius="62%"
                  margin={{ top: 24, right: 48, bottom: 24, left: 48 }}
                >
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <PolarGrid />
                  <PolarAngleAxis dataKey="axis" />
                  <PolarRadiusAxis angle={90} domain={[0, 10]} tickCount={6} />
                  <Radar
                    dataKey="score"
                    name={t("score")}
                    stroke="var(--color-score)"
                    fill="var(--color-score)"
                    fillOpacity={0.35}
                  />
                </RadarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 2. Historique en tableau : une ligne par évaluation, une colonne
          par catégorie (moyenne de cette catégorie pour cette évaluation).
          Seule cette zone défile (flex-1 min-h-0 overflow-y-auto porté par
          le conteneur du <Table>, pas par la Card — sinon le thead sticky
          se fige par rapport à la Card au lieu du véritable ascenseur),
          tout ce qui précède reste fixe à l'écran. L'entête reste visible
          pendant le défilement (sticky, voir table.tsx). */}
      <Card className="lg:min-h-0 lg:flex-1">
        <CardContent className="flex flex-col lg:min-h-0 lg:flex-1">
          {hasError ? (
            <p className="text-sm text-destructive">{t("loadFailed")}</p>
          ) : evaluations === null || axes === null ? null : evaluations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <Table containerClassName="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("date")}</TableHead>
                  {axes.map((axis) => (
                    <TableHead key={axis.id}>{axis.name}</TableHead>
                  ))}
                  <TableHead>{t("authorLabel")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {evaluations.map((evaluation) => (
                  <TableRow key={evaluation.id}>
                    <TableCell>{formatDate(evaluation.date)}</TableCell>
                    {axes.map((axis) => {
                      const average = categoryAverage(evaluation, axis);
                      return (
                        <TableCell key={axis.id}>
                          {average !== undefined ? average.toFixed(1) : "—"}
                        </TableCell>
                      );
                    })}
                    <TableCell>
                      {evaluation.evaluator ? (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <UserRound className="size-3.5" />
                          {evaluation.evaluator.firstName} {evaluation.evaluator.lastName}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {!isOwnProfile && (
                        <div className="flex justify-end gap-1">
                          <EvaluationFormDialog
                            clubId={clubId}
                            teamId={teamId}
                            playerId={playerId}
                            axes={axes}
                            evaluation={evaluation}
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
                            onClick={() => handleDelete(evaluation.id)}
                          >
                            <Trash2 className="text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
