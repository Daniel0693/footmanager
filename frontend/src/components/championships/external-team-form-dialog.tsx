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
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";

export interface ExistingExternalTeam {
  id: number;
  name: string;
  city: string | null;
  country: string | null;
  notes: string | null;
}

const formSchema = z.object({
  name: z.string().min(1),
  city: z.string(),
  country: z.string(),
  notes: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

function defaultValues(externalTeam?: ExistingExternalTeam): FormValues {
  return {
    name: externalTeam?.name ?? "",
    city: externalTeam?.city ?? "",
    country: externalTeam?.country ?? "",
    notes: externalTeam?.notes ?? "",
  };
}

// Modale de création/édition d'une équipe adverse (docs/schema/championnats.md
// — ExternalTeam), même convention que le reste de l'application
// (SeasonFormDialog, NoteFormDialog...) : jamais une page dédiée. `teamId`
// requis même si ExternalTeam est club-scopée en base — le Coach n'a droit
// qu'en scope TEAM sur `external_team` (docs/modules/auth-roles.md
// §"Patterns découverts"), transmis en query sur chaque appel d'écriture.
export function ExternalTeamFormDialog({
  clubId,
  teamId,
  externalTeam,
  trigger,
  onSuccess,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  clubId: string;
  teamId: string;
  trigger?: ReactElement;
  externalTeam?: ExistingExternalTeam;
  onSuccess: () => void;
  // Mode contrôlé (colonne Actions de la liste) : voir SeasonFormDialog pour
  // le même raisonnement.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const mode = externalTeam ? "edit" : "create";
  const t = useTranslations("externalTeams.formDialog");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChangeProp ?? setInternalOpen;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(externalTeam),
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      reset(defaultValues(externalTeam));
    }
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    const headers = authHeaders(accessToken);
    const body = JSON.stringify({
      name: values.name,
      city: values.city || undefined,
      country: values.country || undefined,
      notes: values.notes || undefined,
    });
    try {
      const response =
        mode === "create"
          ? await apiFetch(`/clubs/${clubId}/external-teams?teamId=${teamId}`, {
              method: "POST",
              headers,
              body,
            })
          : await apiFetch(
              `/clubs/${clubId}/external-teams/${externalTeam!.id}?teamId=${teamId}`,
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
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("createTitle") : t("editTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="external-team-name">{t("name")}</Label>
            <Input
              id="external-team-name"
              placeholder={t("namePlaceholder")}
              {...register("name")}
            />
            {errors.name && <p className="text-sm text-destructive">{t("nameRequired")}</p>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="external-team-city">{t("city")}</Label>
              <Input id="external-team-city" {...register("city")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="external-team-country">{t("country")}</Label>
              <Input id="external-team-country" {...register("country")} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="external-team-notes">{t("notes")}</Label>
            <Textarea
              id="external-team-notes"
              rows={3}
              placeholder={t("notesPlaceholder")}
              {...register("notes")}
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
