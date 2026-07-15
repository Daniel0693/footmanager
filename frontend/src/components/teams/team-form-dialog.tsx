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
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";

export interface ExistingTeam {
  id: number;
  name: string;
}

const formSchema = z.object({
  name: z.string().min(1),
});

type FormValues = z.infer<typeof formSchema>;

function defaultValues(team?: ExistingTeam): FormValues {
  return { name: team?.name ?? "" };
}

// Modale de création/édition d'une équipe (docs/roadmap.md B18, retour
// utilisateur — remplace l'ancien formulaire inline de la page Équipes par
// le même pattern dual create/edit que le reste de l'application
// (SeasonFormDialog, ExternalTeamFormDialog...). Gestion réservée à
// AdminClub+ (`team CREATE/UPDATE/DELETE`, seed) : le trigger n'est jamais
// rendu par l'appelant si `!canManage` (voir teams/page.tsx).
export function TeamFormDialog({
  clubId,
  team,
  trigger,
  onSuccess,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  clubId: string;
  trigger?: ReactElement;
  team?: ExistingTeam;
  onSuccess: () => void;
  // Mode contrôlé (colonne Actions de la liste) : voir SeasonFormDialog pour
  // le même raisonnement.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const mode = team ? "edit" : "create";
  const t = useTranslations("teams.formDialog");
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
    defaultValues: defaultValues(team),
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      reset(defaultValues(team));
    }
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    const headers = authHeaders(accessToken);
    const body = JSON.stringify({ name: values.name });
    try {
      const response =
        mode === "create"
          ? await apiFetch(`/clubs/${clubId}/teams`, { method: "POST", headers, body })
          : await apiFetch(`/clubs/${clubId}/teams/${team!.id}`, {
              method: "PATCH",
              headers,
              body,
            });
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("createTitle") : t("editTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="team-name">{t("name")}</Label>
            <Input id="team-name" placeholder={t("namePlaceholder")} {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{t("nameRequired")}</p>}
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
