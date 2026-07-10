"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactElement } from "react";
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
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { STAFF_ROLES, type StaffRole } from "@/lib/staff-role";

export interface ExistingStaff {
  memberId: number;
  staffId: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  birthDate: string | null;
  staffRole: StaffRole;
}

// Édition uniquement (pas de création) : contrairement à PlayerFormDialog,
// aucun bouton "Ajouter un membre du staff" n'existe sur le tableau roster
// (hors périmètre du plan initial, voir docs/modules/effectif-joueurs.md).
// Ne couvre que les champs déjà présents sur RosterRow (firstName/lastName/
// phone/birthDate/role) — pas de fetch supplémentaire, contrairement à
// PlayerFormDialog qui a besoin de champs absents de la liste légère
// (licenseNumber/nationality/preferredFoot/gender/joinDate). `gender` et
// `TeamStaff.startDate` restent donc hors de ce formulaire (non modifiés,
// jamais envoyés dans les PATCH ci-dessous).
const formSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  birthDate: z.string().optional(),
  staffRole: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

function toIsoDateOrNull(value?: string): string | null {
  return value && value.trim() !== "" ? value : null;
}

function toTextOrNull(value?: string): string | null {
  return value && value.trim() !== "" ? value : null;
}

function defaultValues(staff?: ExistingStaff): FormValues {
  return {
    firstName: staff?.firstName ?? "",
    lastName: staff?.lastName ?? "",
    phone: staff?.phone ?? "",
    // .slice(0, 10) : voir le commentaire équivalent dans player-form-dialog.tsx
    // (l'API renvoie une date ISO complète, <input type="date"> n'accepte
    // que "AAAA-MM-JJ").
    birthDate: staff?.birthDate?.slice(0, 10) ?? "",
    staffRole: staff?.staffRole ?? "PRINCIPAL",
  };
}

export function StaffFormDialog({
  clubId,
  teamId,
  trigger,
  staff,
  onSuccess,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  clubId: string;
  teamId: string;
  trigger?: ReactElement;
  staff: ExistingStaff;
  onSuccess: () => void;
  // Même mode contrôlé que PlayerFormDialog (colonne Actions, B5.3) — voir
  // le commentaire équivalent là-bas pour le raisonnement complet.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("staffForm");
  const tRoles = useTranslations("rosterRoles");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChangeProp ?? setInternalOpen;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(staff),
  });

  useEffect(() => {
    if (open) reset(defaultValues(staff));
  }, [open, staff, reset]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    const headers = authHeaders(accessToken);
    try {
      // teamId en query : ces deux routes ne portent pas de teamId dans leur
      // URL naturelle, donc un Coach (rôle scopé TEAM sur member UPDATE)
      // ne serait jamais autorisé sans lui — même pattern que
      // PlayerFormDialog (voir docs/modules/auth-roles.md §"Patterns découverts").
      const memberRes = await apiFetch(
        `/clubs/${clubId}/members/${staff.memberId}?teamId=${teamId}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            firstName: values.firstName,
            lastName: values.lastName,
            phone: toTextOrNull(values.phone) ?? undefined,
            birthDate: toIsoDateOrNull(values.birthDate) ?? undefined,
          }),
        },
      );
      if (!memberRes.ok) throw new Error(await parseErrorCode(memberRes));

      const staffRes = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/staff/${staff.staffId}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ staffRole: values.staffRole }),
        },
      );
      if (!staffRes.ok) throw new Error(await parseErrorCode(staffRes));

      toast.success(t("updated"));
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
          <DialogTitle>{t("editTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="staff-firstName">{t("firstName")}</Label>
              <Input id="staff-firstName" {...register("firstName")} />
              {errors.firstName && (
                <p className="text-sm text-destructive">{t("firstNameRequired")}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="staff-lastName">{t("lastName")}</Label>
              <Input id="staff-lastName" {...register("lastName")} />
              {errors.lastName && (
                <p className="text-sm text-destructive">{t("lastNameRequired")}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="staff-phone">{t("phone")}</Label>
              <Input id="staff-phone" {...register("phone")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="staff-birthDate">{t("birthDate")}</Label>
              <Input id="staff-birthDate" type="date" {...register("birthDate")} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t("role")}</Label>
            <Controller
              control={control}
              name="staffRole"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(value: string | null) => (value ? tRoles(value) : "")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {STAFF_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {tRoles(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {t("submitEdit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
