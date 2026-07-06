"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, type ReactElement } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";

export interface ExistingInterview {
  id: number;
  date: string;
  subject: string;
  summary: string;
  staffFeedback: string | null;
  staffAssessment?: string | null;
  playerFeedback: string | null;
}

const formSchema = z.object({
  date: z.string().min(1),
  subject: z.string().min(1),
  summary: z.string().min(1),
  staffFeedback: z.string().optional(),
  staffAssessment: z.string().optional(),
  playerFeedback: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function defaultValues(interview?: ExistingInterview): FormValues {
  return {
    date: interview?.date.slice(0, 10) ?? "",
    subject: interview?.subject ?? "",
    summary: interview?.summary ?? "",
    staffFeedback: interview?.staffFeedback ?? "",
    staffAssessment: interview?.staffAssessment ?? "",
    playerFeedback: interview?.playerFeedback ?? "",
  };
}

// Champs à compléter après coup (staffFeedback/staffAssessment/playerFeedback)
// : une chaîne vide doit être transmise comme absente, pas comme une valeur
// vide invalide (le backend valide une longueur mini de 1 quand le champ est
// fourni — voir CreatePlayerInterviewDto).
function toOptionalText(value?: string): string | undefined {
  return value && value.trim() !== "" ? value : undefined;
}

export function InterviewFormDialog({
  clubId,
  teamId,
  playerId,
  trigger,
  interview,
  onSuccess,
}: {
  clubId: string;
  teamId: string;
  playerId: string;
  trigger: ReactElement;
  interview?: ExistingInterview;
  onSuccess: () => void;
}) {
  const mode = interview ? "edit" : "create";
  const t = useTranslations("interviews");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(interview),
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      reset(defaultValues(interview));
    }
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    const headers = { Authorization: `Bearer ${accessToken}` };
    const body = JSON.stringify({
      date: values.date,
      subject: values.subject,
      summary: values.summary,
      staffFeedback: toOptionalText(values.staffFeedback),
      staffAssessment: toOptionalText(values.staffAssessment),
      playerFeedback: toOptionalText(values.playerFeedback),
    });
    try {
      const response =
        mode === "create"
          ? await apiFetch(
              `/clubs/${clubId}/players/${playerId}/interviews?teamId=${teamId}`,
              { method: "POST", headers, body },
            )
          : await apiFetch(
              `/clubs/${clubId}/players/${playerId}/interviews/${interview!.id}?teamId=${teamId}`,
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
      <DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("createTitle") : t("editTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interview-date">{t("date")}</Label>
            <Input id="interview-date" type="date" {...register("date")} />
            {errors.date && <p className="text-sm text-destructive">{t("dateRequired")}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interview-subject">{t("subject")}</Label>
            <Input
              id="interview-subject"
              placeholder={t("subjectPlaceholder")}
              {...register("subject")}
            />
            {errors.subject && (
              <p className="text-sm text-destructive">{t("subjectRequired")}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interview-summary">{t("summary")}</Label>
            <Textarea
              id="interview-summary"
              rows={3}
              placeholder={t("summaryPlaceholder")}
              {...register("summary")}
            />
            {errors.summary && (
              <p className="text-sm text-destructive">{t("summaryRequired")}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="interview-staff-feedback">{t("staffFeedback")}</Label>
              <span className="text-xs text-muted-foreground">{t("staffFeedbackHint")}</span>
            </div>
            <Textarea
              id="interview-staff-feedback"
              rows={3}
              placeholder={t("staffFeedbackPlaceholder")}
              {...register("staffFeedback")}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="interview-player-feedback">{t("playerFeedback")}</Label>
              <span className="text-xs text-muted-foreground">{t("playerFeedbackHint")}</span>
            </div>
            <Textarea
              id="interview-player-feedback"
              rows={3}
              placeholder={t("playerFeedbackPlaceholder")}
              {...register("playerFeedback")}
            />
          </div>

          <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-border p-3">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="interview-staff-assessment">{t("staffAssessment")}</Label>
              <span className="text-xs text-muted-foreground">{t("staffAssessmentHint")}</span>
            </div>
            <Textarea
              id="interview-staff-assessment"
              rows={3}
              placeholder={t("staffAssessmentPlaceholder")}
              {...register("staffAssessment")}
            />
          </div>

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
