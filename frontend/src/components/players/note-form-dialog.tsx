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
import { apiFetch, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { NOTE_VISIBILITIES, type NoteVisibility } from "@/lib/note-visibility";

export interface ExistingNote {
  id: number;
  visibility: NoteVisibility;
  title: string | null;
  content: string;
}

const formSchema = z.object({
  visibility: z.string().min(1),
  title: z.string().optional(),
  content: z.string().min(1),
});

type FormValues = z.infer<typeof formSchema>;

function defaultValues(note?: ExistingNote): FormValues {
  return {
    visibility: note?.visibility ?? "SEMI_PRIVE",
    title: note?.title ?? "",
    content: note?.content ?? "",
  };
}

function toOptionalText(value?: string): string | undefined {
  return value && value.trim() !== "" ? value : undefined;
}

export function NoteFormDialog({
  clubId,
  teamId,
  playerId,
  trigger,
  note,
  onSuccess,
}: {
  clubId: string;
  teamId: string;
  playerId: string;
  trigger: ReactElement;
  note?: ExistingNote;
  onSuccess: () => void;
}) {
  const mode = note ? "edit" : "create";
  const t = useTranslations("notes");
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
    defaultValues: defaultValues(note),
  });
  const visibility = useWatch({ control, name: "visibility" }) as NoteVisibility;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      reset(defaultValues(note));
    }
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    const headers = { Authorization: `Bearer ${accessToken}` };
    const body = JSON.stringify({
      visibility: values.visibility,
      title: toOptionalText(values.title),
      content: values.content,
    });
    try {
      const response =
        mode === "create"
          ? await apiFetch(
              `/clubs/${clubId}/players/${playerId}/notes?teamId=${teamId}`,
              { method: "POST", headers, body },
            )
          : await apiFetch(
              `/clubs/${clubId}/players/${playerId}/notes/${note!.id}?teamId=${teamId}`,
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

          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="note-title">{t("title")}</Label>
              <span className="text-xs text-muted-foreground">{t("titleOptional")}</span>
            </div>
            <Input id="note-title" placeholder={t("titlePlaceholder")} {...register("title")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note-content">{t("content")}</Label>
            <Textarea
              id="note-content"
              rows={4}
              placeholder={t("contentPlaceholder")}
              {...register("content")}
            />
            {errors.content && (
              <p className="text-sm text-destructive">{t("contentRequired")}</p>
            )}
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
