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

export interface ExistingSeason {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
}

const formSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

type FormValues = z.infer<typeof formSchema>;

function defaultValues(season?: ExistingSeason): FormValues {
  return {
    name: season?.name ?? "",
    // .slice(0, 10) : l'API renvoie une date ISO complète, <input type="date">
    // n'accepte que "AAAA-MM-JJ" (même piège documenté dans player-form-dialog.tsx).
    startDate: season?.startDate.slice(0, 10) ?? "",
    endDate: season?.endDate.slice(0, 10) ?? "",
  };
}

// Modale de création/édition d'une saison (club-wide, révision A14-A17,
// docs/roadmap.md) — cohérente avec le reste de l'application (NoteFormDialog,
// ObjectiveFormDialog, PlayerFormDialog...), jamais une page ou un formulaire
// inline dédié (retour utilisateur explicite : une seule façon de créer/
// éditer une entrée dans tout le système). Crée toujours en DRAFT (status non
// exposé, voir CreateSeasonDto backend) ; passage à ACTIVE/ARCHIVED réservé
// au bouton Activer de la fiche de saison, jamais ici.
export function SeasonFormDialog({
  clubId,
  season,
  trigger,
  onSuccess,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  clubId: string;
  trigger?: ReactElement;
  season?: ExistingSeason;
  onSuccess: () => void;
  // Mode contrôlé (colonne Actions de la liste des saisons) : pas de
  // <DialogTrigger> visible, l'ouverture est déclenchée depuis un item de
  // DropdownMenu — même pattern que PlayerFormDialog. Sans ces deux props,
  // le composant reste self-managé (trigger visible + état interne),
  // comportement inchangé pour les usages existants (liste, fiche détail).
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const mode = season ? "edit" : "create";
  const t = useTranslations("seasons.formDialog");
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
    defaultValues: defaultValues(season),
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      reset(defaultValues(season));
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (values.endDate < values.startDate) {
      toast.error(t("endDateBeforeStartDate"));
      return;
    }

    setIsSubmitting(true);
    const headers = authHeaders(accessToken);
    const body = JSON.stringify(values);
    try {
      const response =
        mode === "create"
          ? await apiFetch(`/clubs/${clubId}/seasons`, {
              method: "POST",
              headers,
              body,
            })
          : await apiFetch(`/clubs/${clubId}/seasons/${season!.id}`, {
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("createTitle") : t("editTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="season-name">{t("name")}</Label>
            <Input
              id="season-name"
              placeholder={t("namePlaceholder")}
              {...register("name")}
            />
            {errors.name && <p className="text-sm text-destructive">{t("nameRequired")}</p>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="season-startDate">{t("startDate")}</Label>
              <Input id="season-startDate" type="date" {...register("startDate")} />
              {errors.startDate && (
                <p className="text-sm text-destructive">{t("dateRequired")}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="season-endDate">{t("endDate")}</Label>
              <Input id="season-endDate" type="date" {...register("endDate")} />
              {errors.endDate && (
                <p className="text-sm text-destructive">{t("dateRequired")}</p>
              )}
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
