"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent, type ReactElement } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StarRatingInput } from "@/components/ui/star-rating-input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import type { EvaluationAxis } from "@/components/players/evaluation-tab";

export interface ExistingEvaluation {
  id: number;
  date: string;
  comments: string | null;
  scores: Array<{ criterionId: number; score: string }>;
}

// Moyenne des critères déjà notés de cet axe — se met à jour au fil de la
// saisie (retour du 2026-07-06), pas seulement une fois le formulaire
// complet. `undefined` tant qu'aucun critère de la catégorie n'a de score.
function axisAverage(
  scores: Record<number, number>,
  axis: EvaluationAxis,
): number | undefined {
  const values = axis.criteria
    .map((c) => scores[c.id])
    .filter((v): v is number => v !== undefined);
  if (values.length === 0) return undefined;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function defaultScores(
  axes: EvaluationAxis[],
  evaluation?: ExistingEvaluation,
): Record<number, number> {
  if (!evaluation) return {};
  const scoresByCriterion = new Map(
    evaluation.scores.map((s) => [s.criterionId, Number(s.score)]),
  );
  const result: Record<number, number> = {};
  for (const axis of axes) {
    for (const criterion of axis.criteria) {
      const score = scoresByCriterion.get(criterion.id);
      if (score !== undefined) result[criterion.id] = score;
    }
  }
  return result;
}

export function EvaluationFormDialog({
  clubId,
  teamId,
  playerId,
  axes,
  trigger,
  evaluation,
  onSuccess,
}: {
  clubId: string;
  teamId: string;
  playerId: string;
  axes: EvaluationAxis[];
  trigger: ReactElement;
  evaluation?: ExistingEvaluation;
  onSuccess: () => void;
}) {
  const mode = evaluation ? "edit" : "create";
  const t = useTranslations("evaluations");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [comments, setComments] = useState("");
  const [scores, setScores] = useState<Record<number, number>>({});
  const [errors, setErrors] = useState<{ date?: boolean; scores?: boolean }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allCriteria = axes.flatMap((axis) => axis.criteria);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setDate(evaluation?.date.slice(0, 10) ?? "");
      setComments(evaluation?.comments ?? "");
      setScores(defaultScores(axes, evaluation));
      setErrors({});
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const missingScores = allCriteria.some((c) => scores[c.id] === undefined);
    const nextErrors = { date: date.trim() === "", scores: missingScores };
    setErrors(nextErrors);
    if (nextErrors.date || nextErrors.scores) return;

    setIsSubmitting(true);
    const headers = authHeaders(accessToken);
    const body = JSON.stringify({
      date,
      comments: comments.trim() === "" ? undefined : comments,
      scores: allCriteria.map((c) => ({ criterionId: c.id, score: scores[c.id] })),
    });
    try {
      const response =
        mode === "create"
          ? await apiFetch(
              `/clubs/${clubId}/players/${playerId}/evaluations?teamId=${teamId}`,
              { method: "POST", headers, body },
            )
          : await apiFetch(
              `/clubs/${clubId}/players/${playerId}/evaluations/${evaluation!.id}?teamId=${teamId}`,
              { method: "PATCH", headers, body },
            );
      if (!response.ok) throw new Error(await parseErrorCode(response));

      toast.success(mode === "create" ? t("created") : t("updated"));
      setOpen(false);
      onSuccess();
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(tErrors(code));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("createTitle") : t("editTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="evaluation-date">{t("date")}</Label>
              <Input
                id="evaluation-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
              {errors.date && (
                <p className="text-sm text-destructive">{t("dateRequired")}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="evaluation-comments">{t("comments")}</Label>
              <Textarea
                id="evaluation-comments"
                rows={1}
                placeholder={t("commentsPlaceholder")}
                value={comments}
                onChange={(event) => setComments(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {axes.map((axis) => {
              const average = axisAverage(scores, axis);
              return (
              <div key={axis.id} className="flex flex-col gap-1.5">
                <p className="flex items-baseline justify-between gap-2 text-sm font-medium">
                  <span>{axis.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {average !== undefined ? average.toFixed(1) : "—"}
                  </span>
                </p>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  {axis.criteria.map((criterion) => (
                    <div
                      key={criterion.id}
                      className="flex flex-col items-center gap-0.5 rounded-lg border border-border p-1.5 text-center"
                    >
                      <span className="text-xs text-muted-foreground">
                        {criterion.name}
                      </span>
                      <StarRatingInput
                        label={criterion.name}
                        value={scores[criterion.id]}
                        onChange={(score) =>
                          setScores((prev) => ({ ...prev, [criterion.id]: score }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
              );
            })}
          </div>
          {errors.scores && (
            <p className="text-sm text-destructive">{t("scoresRequired")}</p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {mode === "create" ? t("submitCreate") : t("submitEdit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
