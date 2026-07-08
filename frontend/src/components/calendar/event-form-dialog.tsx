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
import { EVENT_TYPES, type EventType } from "@/lib/event";

export interface EventFormTeam {
  id: number;
  name: string;
}

export interface ExistingEvent {
  id: number;
  type: EventType;
  title: string;
  startAt: string;
  endAt: string | null;
  location: string | null;
  description: string | null;
  team: EventFormTeam;
}

const formSchema = z.object({
  teamId: z.string().min(1),
  type: z.string().min(1),
  title: z.string().min(1),
  startAt: z.string().min(1),
  endAt: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

// L'input natif <input type="datetime-local"> attend "AAAA-MM-JJTHH:mm" en
// heure locale (pas d'offset) — conversion aller-retour avec l'ISO renvoyé
// par le backend.
function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIso(value: string): string {
  return new Date(value).toISOString();
}

function toOptionalText(value?: string): string | undefined {
  return value && value.trim() !== "" ? value : undefined;
}

function defaultValues(teams: EventFormTeam[], event?: ExistingEvent): FormValues {
  return {
    teamId: String(event?.team.id ?? teams[0]?.id ?? ""),
    type: event?.type ?? "TRAINING",
    title: event?.title ?? "",
    startAt: event ? toDatetimeLocalValue(event.startAt) : "",
    endAt: event?.endAt ? toDatetimeLocalValue(event.endAt) : "",
    location: event?.location ?? "",
    description: event?.description ?? "",
  };
}

export function EventFormDialog({
  clubId,
  teams,
  trigger,
  event,
  onSuccess,
}: {
  clubId: string;
  teams: EventFormTeam[];
  trigger: ReactElement;
  event?: ExistingEvent;
  onSuccess: () => void;
}) {
  const mode = event ? "edit" : "create";
  const t = useTranslations("calendar");
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
    defaultValues: defaultValues(teams, event),
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      reset(defaultValues(teams, event));
    }
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    const headers = { Authorization: `Bearer ${accessToken}` };
    const body = JSON.stringify({
      type: values.type,
      title: values.title,
      startAt: toIso(values.startAt),
      endAt: values.endAt ? toIso(values.endAt) : undefined,
      location: toOptionalText(values.location),
      description: toOptionalText(values.description),
    });
    try {
      const response =
        mode === "create"
          ? await apiFetch(`/clubs/${clubId}/teams/${values.teamId}/events`, {
              method: "POST",
              headers,
              body,
            })
          : await apiFetch(
              `/clubs/${clubId}/teams/${event!.team.id}/events/${event!.id}`,
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
            {mode === "create" && teams.length > 1 ? (
              <div className="flex flex-col gap-1.5">
                <Label>{t("team")}</Label>
                <Controller
                  control={control}
                  name="teamId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(v: string | null) =>
                            teams.find((team) => String(team.id) === v)?.name ?? ""
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {teams.map((team) => (
                          <SelectItem key={team.id} value={String(team.id)}>
                            {team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            ) : mode === "edit" ? (
              <div className="flex flex-col gap-1.5">
                <Label>{t("team")}</Label>
                <p className="text-sm text-muted-foreground">{event!.team.name}</p>
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label>{t("type")}</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{(v: string | null) => (v ? t(`type${v}`) : "")}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {t(`type${type}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-title">{t("titleLabel")}</Label>
            <Input id="event-title" {...register("title")} />
            {errors.title && <p className="text-sm text-destructive">{t("titleRequired")}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-start-at">{t("startAt")}</Label>
              <Input id="event-start-at" type="datetime-local" {...register("startAt")} />
              {errors.startAt && (
                <p className="text-sm text-destructive">{t("startAtRequired")}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-end-at">{t("endAt")}</Label>
              <Input id="event-end-at" type="datetime-local" {...register("endAt")} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-location">{t("location")}</Label>
            <Input id="event-location" {...register("location")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-description">{t("description")}</Label>
            <Textarea id="event-description" rows={3} {...register("description")} />
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
