"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, type ReactElement } from "react";
import { Controller, useForm } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";

// Liste fermée (plutôt que texte libre) pour permettre des statistiques par
// motif d'absence (docs/schema/joueurs.md §PlayerAbsence) — un champ
// description libre complète le motif sélectionné.
export const ABSENCE_REASONS = ["INJURY", "ILLNESS", "VACATION", "OTHER"] as const;
export type AbsenceReasonValue = (typeof ABSENCE_REASONS)[number];

export interface ExistingAbsence {
  id: number;
  reason: AbsenceReasonValue;
  description: string | null;
  startDate: string;
  endDate: string;
  isExcused: boolean | null;
}

// "unspecified"/"true"/"false" en chaînes : isExcused est un booléen
// nullable côté Prisma (Boolean?), un <Select> ne travaille qu'avec des
// chaînes — converti à la soumission (voir onSubmit ci-dessous).
const IS_EXCUSED_VALUES = ["unspecified", "true", "false"] as const;
type IsExcusedValue = (typeof IS_EXCUSED_VALUES)[number];

function toIsExcusedValue(value: boolean | null | undefined): IsExcusedValue {
  if (value === true) return "true";
  if (value === false) return "false";
  return "unspecified";
}

export function reasonLabelKey(value: AbsenceReasonValue): "reasonInjury" | "reasonIllness" | "reasonVacation" | "reasonOther" {
  if (value === "INJURY") return "reasonInjury";
  if (value === "ILLNESS") return "reasonIllness";
  if (value === "VACATION") return "reasonVacation";
  return "reasonOther";
}

const formSchema = z.object({
  reason: z.enum(ABSENCE_REASONS),
  description: z.string(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  isExcused: z.enum(IS_EXCUSED_VALUES),
});

type FormValues = z.infer<typeof formSchema>;

function defaultValues(absence?: ExistingAbsence): FormValues {
  return {
    reason: absence?.reason ?? "INJURY",
    description: absence?.description ?? "",
    startDate: absence?.startDate?.slice(0, 10) ?? "",
    endDate: absence?.endDate?.slice(0, 10) ?? "",
    isExcused: toIsExcusedValue(absence?.isExcused),
  };
}

export function AbsenceFormDialog({
  clubId,
  teamId,
  playerId,
  trigger,
  absence,
  onSuccess,
  // Seul l'entraîneur décide si une absence est justifiée — un joueur qui
  // déclare sa propre absence ne doit jamais voir ni renseigner ce champ
  // (voir aussi l'enforcement côté backend, PlayerAbsencesService.create).
  canSetExcused = true,
}: {
  clubId: string;
  teamId: string;
  playerId: string;
  trigger: ReactElement;
  absence?: ExistingAbsence;
  onSuccess: () => void;
  canSetExcused?: boolean;
}) {
  const mode = absence ? "edit" : "create";
  const t = useTranslations("absences");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(absence),
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      reset(defaultValues(absence));
    }
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    const headers = { Authorization: `Bearer ${accessToken}` };
    const body = JSON.stringify({
      reason: values.reason,
      description: values.description || undefined,
      startDate: values.startDate,
      endDate: values.endDate,
      isExcused:
        !canSetExcused || values.isExcused === "unspecified"
          ? undefined
          : values.isExcused === "true",
    });
    try {
      const response =
        mode === "create"
          ? await apiFetch(`/clubs/${clubId}/players/${playerId}/absences?teamId=${teamId}`, {
              method: "POST",
              headers,
              body,
            })
          : await apiFetch(
              `/clubs/${clubId}/players/${playerId}/absences/${absence!.id}?teamId=${teamId}`,
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
            <Label>{t("reason")}</Label>
            <Controller
              control={control}
              name="reason"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full" aria-label={t("reason")}>
                    <SelectValue>
                      {(v: string | null) => (v ? t(reasonLabelKey(v as AbsenceReasonValue)) : "")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ABSENCE_REASONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(reasonLabelKey(value))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.reason && <p className="text-sm text-destructive">{t("reasonRequired")}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="absence-description">{t("descriptionLabel")}</Label>
            <Textarea
              id="absence-description"
              rows={3}
              placeholder={t("descriptionPlaceholder")}
              {...register("description")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="absence-start-date">{t("startDate")}</Label>
              <Input id="absence-start-date" type="date" {...register("startDate")} />
              {errors.startDate && (
                <p className="text-sm text-destructive">{t("startDateRequired")}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="absence-end-date">{t("endDate")}</Label>
              <Input id="absence-end-date" type="date" {...register("endDate")} />
              {errors.endDate && (
                <p className="text-sm text-destructive">{t("endDateRequired")}</p>
              )}
            </div>
          </div>

          {canSetExcused && (
            <div className="flex flex-col gap-1.5">
              <Label>{t("isExcused")}</Label>
              <Controller
                control={control}
                name="isExcused"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" aria-label={t("isExcused")}>
                      <SelectValue>
                        {(v: string | null) =>
                          v ? t(`isExcused${v === "true" ? "True" : v === "false" ? "False" : "Unspecified"}`) : ""
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {IS_EXCUSED_VALUES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(
                            `isExcused${value === "true" ? "True" : value === "false" ? "False" : "Unspecified"}`,
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
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
