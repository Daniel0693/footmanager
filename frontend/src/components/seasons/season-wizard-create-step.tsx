"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";

const formSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

type FormValues = z.infer<typeof formSchema>;

export interface CreatedSeason {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
}

// Étape 1 du wizard (docs/modules/saisons-championnats.md) : crée toujours
// une Season en DRAFT (status non exposé, voir CreateSeasonDto backend) —
// l'ancienne saison ACTIVE de l'équipe n'est jamais touchée à ce stade.
export function SeasonWizardCreateStep({
  clubId,
  teamId,
  onCreated,
}: {
  clubId: string;
  teamId: string;
  onCreated: (season: CreatedSeason) => void;
}) {
  const t = useTranslations("seasons.wizard.createStep");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const onSubmit = async (values: FormValues) => {
    if (values.endDate < values.startDate) {
      toast.error(t("endDateBeforeStartDate"));
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiFetch(`/clubs/${clubId}/teams/${teamId}/seasons`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: JSON.stringify(values),
      });
      if (!response.ok) throw new Error(await parseErrorCode(response));
      const season = (await response.json()) as CreatedSeason;
      toast.success(t("created"));
      onCreated(season);
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(code ? tErrors(code) : t("createFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{t("name")}</Label>
        <Input id="name" placeholder={t("namePlaceholder")} {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{t("nameRequired")}</p>}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="startDate">{t("startDate")}</Label>
          <Input id="startDate" type="date" {...register("startDate")} />
          {errors.startDate && (
            <p className="text-sm text-destructive">{t("dateRequired")}</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="endDate">{t("endDate")}</Label>
          <Input id="endDate" type="date" {...register("endDate")} />
          {errors.endDate && <p className="text-sm text-destructive">{t("dateRequired")}</p>}
        </div>
      </div>
      <Button type="submit" disabled={isSubmitting} className="self-start">
        {t("submit")}
      </Button>
    </form>
  );
}
