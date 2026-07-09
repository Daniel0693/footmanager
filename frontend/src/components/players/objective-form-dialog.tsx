"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, type ReactElement } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import {
  OBJECTIVE_HORIZONS,
  OBJECTIVE_STATUSES,
  OBJECTIVE_THEMES,
  type ObjectiveHorizon,
  type ObjectiveStatus,
  type ObjectiveTheme,
} from "@/lib/objective";
import type { NoteVisibility } from "@/lib/note-visibility";
import { NOTE_VISIBILITIES } from "@/lib/note-visibility";

export interface ExistingObjective {
  id: number;
  theme: ObjectiveTheme;
  description: string;
  horizon: ObjectiveHorizon;
  status: ObjectiveStatus;
  visibility: NoteVisibility;
  startDate: string | null;
  dueDate: string | null;
  completedDate: string | null;
}

const formSchema = z.object({
  theme: z.string().min(1),
  description: z.string().min(1),
  horizon: z.string().min(1),
  status: z.string().min(1),
  visibility: z.string().min(1),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  completedDate: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function defaultValues(objective?: ExistingObjective): FormValues {
  return {
    theme: objective?.theme ?? "TECHNIQUE",
    description: objective?.description ?? "",
    horizon: objective?.horizon ?? "SHORT_TERM",
    status: objective?.status ?? "PLANNED",
    visibility: objective?.visibility ?? "SEMI_PRIVE",
    startDate: objective?.startDate?.slice(0, 10) ?? "",
    dueDate: objective?.dueDate?.slice(0, 10) ?? "",
    completedDate: objective?.completedDate?.slice(0, 10) ?? "",
  };
}

function toOptionalText(value?: string): string | undefined {
  return value && value.trim() !== "" ? value : undefined;
}

export function ObjectiveFormDialog({
  clubId,
  teamId,
  playerId,
  trigger,
  objective,
  onSuccess,
}: {
  clubId: string;
  teamId: string;
  playerId: string;
  trigger: ReactElement;
  objective?: ExistingObjective;
  onSuccess: () => void;
}) {
  const mode = objective ? "edit" : "create";
  const t = useTranslations("objectives");
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
    defaultValues: defaultValues(objective),
  });
  const visibility = useWatch({ control, name: "visibility" }) as NoteVisibility;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      reset(defaultValues(objective));
    }
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    const headers = authHeaders(accessToken);
    const body = JSON.stringify({
      theme: values.theme,
      description: values.description,
      horizon: values.horizon,
      status: values.status,
      visibility: values.visibility,
      startDate: toOptionalText(values.startDate),
      dueDate: toOptionalText(values.dueDate),
      completedDate: toOptionalText(values.completedDate),
    });
    try {
      const response =
        mode === "create"
          ? await apiFetch(
              `/clubs/${clubId}/players/${playerId}/objectives?teamId=${teamId}`,
              { method: "POST", headers, body },
            )
          : await apiFetch(
              `/clubs/${clubId}/players/${playerId}/objectives/${objective!.id}?teamId=${teamId}`,
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
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("theme")}</Label>
              <Controller
                control={control}
                name="theme"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{(v: string | null) => (v ? t(`theme${v}`) : "")}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {OBJECTIVE_THEMES.map((theme) => (
                        <SelectItem key={theme} value={theme}>
                          {t(`theme${theme}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("horizon")}</Label>
              <Controller
                control={control}
                name="horizon"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v: string | null) => (v ? t(`horizon${v}`) : "")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {OBJECTIVE_HORIZONS.map((horizon) => (
                        <SelectItem key={horizon} value={horizon}>
                          {t(`horizon${horizon}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="objective-description">{t("description")}</Label>
            <Textarea
              id="objective-description"
              rows={3}
              placeholder={t("descriptionPlaceholder")}
              {...register("description")}
            />
            {errors.description && (
              <p className="text-sm text-destructive">{t("descriptionRequired")}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("status")}</Label>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{(v: string | null) => (v ? t(`status${v}`) : "")}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {OBJECTIVE_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {t(`status${status}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("visibility")}</Label>
              <Controller
                control={control}
                name="visibility"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v: string | null) => (v ? t(`visibility${v}`) : "")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {NOTE_VISIBILITIES.map((v) => (
                        <SelectItem key={v} value={v}>
                          {t(`visibility${v}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {visibility && (
                <p className="text-xs text-muted-foreground">{t(`visibility${visibility}Hint`)}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-1">
                <Label htmlFor="objective-start-date">{t("startDate")}</Label>
              </div>
              <Input id="objective-start-date" type="date" {...register("startDate")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="objective-due-date">{t("dueDate")}</Label>
              <Input id="objective-due-date" type="date" {...register("dueDate")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="objective-completed-date">{t("completedDate")}</Label>
              <Input id="objective-completed-date" type="date" {...register("completedDate")} />
            </div>
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
